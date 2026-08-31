"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTestApp = createTestApp;
exports.apiPath = apiPath;
exports.closeTestApp = closeTestApp;
const common_1 = require("@nestjs/common");
const testing_1 = require("@nestjs/testing");
const app_module_1 = require("../../src/app.module");
const http_exception_filter_1 = require("../../src/common/filters/http-exception.filter");
const API_PREFIX = 'api/v1';
/**
 * Mirrors main.ts's bootstrap (prefix, global ValidationPipe, exception
 * filter) so e2e tests exercise the same request pipeline production does.
 * Omits helmet()/CORS -- irrelevant to authorization behavior under test.
 */
async function createTestApp() {
    const moduleRef = await testing_1.Test.createTestingModule({
        imports: [app_module_1.AppModule],
    }).compile();
    const app = moduleRef.createNestApplication();
    app.setGlobalPrefix(API_PREFIX, { exclude: ['health'] });
    app.useGlobalPipes(new common_1.ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new http_exception_filter_1.HttpExceptionFilter());
    await app.init();
    return app;
}
function apiPath(path) {
    return `/${API_PREFIX}/${path.replace(/^\//, '')}`;
}
/**
 * app.close() tears down every module, including RedisStreamsService's
 * onModuleDestroy (`await this.redis.quit()`), which throws when no local
 * Redis is reachable and ioredis has already exhausted its retry budget.
 * That's an environmental gap unrelated to what these suites test -- a
 * failed Redis teardown must not fail an authorization test run.
 */
async function closeTestApp(app) {
    try {
        await app.close();
    }
    catch (err) {
        // eslint-disable-next-line no-console
        console.warn(`app.close() threw during teardown (expected without a local Redis): ${err instanceof Error ? err.message : err}`);
    }
}
//# sourceMappingURL=test-app.js.map