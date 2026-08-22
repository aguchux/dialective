import logging
import time
from typing import Callable, Dict

import redis

logger = logging.getLogger(__name__)

MAX_DELIVERY_ATTEMPTS = 3
RECLAIM_IDLE_MS = 5 * 60 * 1000


class StreamConsumer:
    """
    Consumer-group read loop with the shared retry/DLQ contract from
    AGENTS.md ("Redis Streams reliability"): reclaim stuck pending entries,
    dead-letter after MAX_DELIVERY_ATTEMPTS. Mirrors
    services/*/src/redis-streams/redis-streams.service.ts so the pattern is
    consistent across the Python and NestJS sides.
    """

    def __init__(
        self, client: redis.Redis, stream: str, group: str, consumer_name: str
    ):
        self.client = client
        self.stream = stream
        self.group = group
        self.consumer_name = consumer_name
        self._ensure_group()

    def _ensure_group(self) -> None:
        try:
            self.client.xgroup_create(self.stream, self.group, id="0", mkstream=True)
        except redis.ResponseError as err:
            if "BUSYGROUP" not in str(err):
                raise

    def run(
        self,
        handler: Callable[[str, Dict[str, str]], None],
        poll_interval_s: float = 5.0,
    ) -> None:
        while True:
            self._reclaim_stuck_entries(handler)

            entries = self.client.xreadgroup(
                self.group,
                self.consumer_name,
                {self.stream: ">"},
                count=1,
                block=int(poll_interval_s * 1000),
            )
            if not entries:
                continue

            for _stream_name, messages in entries:
                for msg_id, fields in messages:
                    self._handle(msg_id, fields, handler)

    def _handle(
        self,
        msg_id: str,
        fields: Dict[str, str],
        handler: Callable[[str, Dict[str, str]], None],
    ) -> None:
        try:
            handler(msg_id, fields)
            self.client.xack(self.stream, self.group, msg_id)
        except Exception:
            logger.exception("Handler failed for %s %s", self.stream, msg_id)
            # Left un-acked; _reclaim_stuck_entries will retry or dead-letter it.

    def _reclaim_stuck_entries(
        self, handler: Callable[[str, Dict[str, str]], None]
    ) -> None:
        _next_cursor, claimed, _deleted = self.client.xautoclaim(
            self.stream,
            self.group,
            self.consumer_name,
            min_idle_time=RECLAIM_IDLE_MS,
            start_id="0-0",
            count=10,
        )

        for msg_id, fields in claimed:
            pending = self.client.xpending_range(
                self.stream, self.group, min=msg_id, max=msg_id, count=1
            )
            delivery_count = pending[0]["times_delivered"] if pending else 1

            if delivery_count > MAX_DELIVERY_ATTEMPTS:
                self._dead_letter(msg_id, fields, "max_delivery_attempts_exceeded")
                continue

            self._handle(msg_id, fields, handler)

    def _dead_letter(self, msg_id: str, fields: Dict[str, str], reason: str) -> None:
        logger.warning("Dead-lettering %s %s: %s", self.stream, msg_id, reason)
        self.client.xadd(f"{self.stream}-dead", {**fields, "reason": reason})
        self.client.xack(self.stream, self.group, msg_id)


def publish(client: redis.Redis, stream: str, data: Dict[str, str]) -> str:
    return client.xadd(stream, data)
