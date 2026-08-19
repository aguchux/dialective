import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@dialectiva/db';

// Mirrors services/settlement-job/src/prisma/prisma.service.ts exactly. api
// owns the schema/migrations; this service only connects the shared
// generated client to the same Postgres instance (DATABASE_URL, wired in
// this service's k8s CronJob) -- see AGENTS.md "Database access".
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
