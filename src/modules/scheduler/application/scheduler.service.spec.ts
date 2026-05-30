import { SchedulerRegistry } from "@nestjs/schedule";
import { Test, type TestingModule } from "@nestjs/testing";
import {
  SchedulerConcurrencyPolicy,
  SchedulerJobLogStatus,
  SchedulerJobStatus,
  SchedulerMisfirePolicy,
} from "../../../../generated/prisma/client";
import { AppConfigService } from "../../../shared/config/app-config.service";
import { SchedulerRepository } from "../infrastructure/scheduler.repository";
import { SchedulerExecutorRegistry } from "../infrastructure/scheduler-executor.registry";
import { SchedulerService } from "./scheduler.service";

describe("SchedulerService", () => {
  async function createHarness(jobs: Array<Record<string, unknown>>) {
    const registeredJobs = new Map<
      string,
      {
        stop: () => void;
      }
    >();
    const schedulerRegistry = {
      addCronJob: jest.fn((name: string, job: { stop: () => void }) => {
        registeredJobs.set(name, job);
      }),
      deleteCronJob: jest.fn((name: string) => {
        const job = registeredJobs.get(name);
        job?.stop();
        registeredJobs.delete(name);
      }),
    };
    const schedulerRepository = {
      listActiveJobs: jest.fn().mockResolvedValue(jobs),
      findJobs: jest.fn(),
      findJobLogs: jest.fn(),
      findJobByName: jest.fn(),
      findJobByInvokeTarget: jest.fn().mockResolvedValue(null),
      findJobById: jest.fn(),
      createJob: jest.fn(),
      updateJob: jest.fn().mockResolvedValue(undefined),
      deleteJob: jest.fn(),
      createJobLog: jest.fn().mockResolvedValue({
        id: 1,
        status: SchedulerJobLogStatus.SUCCESS,
      }),
    };
    const schedulerExecutorRegistry = {
      listExecutors: jest.fn().mockReturnValue([]),
      hasExecutor: jest.fn().mockReturnValue(true),
      runExecutor: jest.fn().mockResolvedValue({
        summary: "ok",
      }),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        SchedulerService,
        {
          provide: AppConfigService,
          useValue: {
            schedulerEnabled: true,
            schedulerTimezone: "Asia/Shanghai",
            databaseBackupDefaultEnabled: true,
          },
        },
        {
          provide: SchedulerRepository,
          useValue: schedulerRepository,
        },
        {
          provide: SchedulerExecutorRegistry,
          useValue: schedulerExecutorRegistry,
        },
        {
          provide: SchedulerRegistry,
          useValue: schedulerRegistry,
        },
      ],
    }).compile();

    return {
      moduleRef,
      service: moduleRef.get(SchedulerService),
      schedulerRegistry,
      schedulerRepository,
      schedulerExecutorRegistry,
    };
  }

  it("fires a catch-up run on bootstrap when misfire policy is FIRE_AND_PROCEED", async () => {
    const harness = await createHarness([
      {
        id: 1,
        jobName: "Catch up job",
        invokeTarget: "system.noop",
        cronExpression: "0 */5 * * * *",
        status: SchedulerJobStatus.ACTIVE,
        concurrencyPolicy: SchedulerConcurrencyPolicy.FORBID,
        misfirePolicy: SchedulerMisfirePolicy.FIRE_AND_PROCEED,
        remark: null,
        lastRunAt: new Date(Date.now() - 5 * 60 * 1000),
        createdAt: new Date(Date.now() - 10 * 60 * 1000),
        updatedBy: "admin",
      },
    ]);

    try {
      await harness.service.onApplicationBootstrap();

      expect(
        harness.schedulerExecutorRegistry.runExecutor,
      ).toHaveBeenCalledWith("system.noop");
      expect(harness.schedulerRepository.createJobLog).toHaveBeenCalled();
      expect(harness.schedulerRegistry.addCronJob).toHaveBeenCalled();
    } finally {
      await harness.moduleRef.close();
    }
  });

  it("creates the default weekly database backup job on bootstrap", async () => {
    const harness = await createHarness([]);

    try {
      await harness.service.onApplicationBootstrap();

      expect(harness.schedulerRepository.createJob).toHaveBeenCalledWith(
        expect.objectContaining({
          jobName: "每周数据库全量备份",
          invokeTarget: "database.full-backup",
          cronExpression: "0 30 2 * * 0",
          concurrencyPolicy: SchedulerConcurrencyPolicy.FORBID,
          misfirePolicy: SchedulerMisfirePolicy.SKIP,
          status: SchedulerJobStatus.ACTIVE,
        }),
      );
    } finally {
      await harness.moduleRef.close();
    }
  });

  it("skips catch-up execution when misfire policy is SKIP", async () => {
    const harness = await createHarness([
      {
        id: 1,
        jobName: "Skip job",
        invokeTarget: "system.noop",
        cronExpression: "0 */5 * * * *",
        status: SchedulerJobStatus.ACTIVE,
        concurrencyPolicy: SchedulerConcurrencyPolicy.FORBID,
        misfirePolicy: SchedulerMisfirePolicy.SKIP,
        remark: null,
        lastRunAt: new Date(Date.now() - 5 * 60 * 1000),
        createdAt: new Date(Date.now() - 10 * 60 * 1000),
        updatedBy: "admin",
      },
    ]);

    try {
      await harness.service.onApplicationBootstrap();

      expect(
        harness.schedulerExecutorRegistry.runExecutor,
      ).not.toHaveBeenCalled();
      expect(harness.schedulerRegistry.addCronJob).toHaveBeenCalled();
    } finally {
      await harness.moduleRef.close();
    }
  });

  it("does not fire early when the next cron occurrence is still in the future", async () => {
    const createdAt = new Date("2026-03-15T00:00:00.000Z");
    const nowSpy = jest
      .spyOn(Date, "now")
      .mockReturnValue(new Date("2026-03-15T00:01:00.000Z").getTime());
    const harness = await createHarness([
      {
        id: 1,
        jobName: "Daily job",
        invokeTarget: "system.noop",
        cronExpression: "0 0 8 * * *",
        status: SchedulerJobStatus.ACTIVE,
        concurrencyPolicy: SchedulerConcurrencyPolicy.FORBID,
        misfirePolicy: SchedulerMisfirePolicy.FIRE_AND_PROCEED,
        remark: null,
        lastRunAt: null,
        createdAt,
        updatedBy: "admin",
      },
    ]);

    try {
      await harness.service.onApplicationBootstrap();

      expect(
        harness.schedulerExecutorRegistry.runExecutor,
      ).not.toHaveBeenCalled();
      expect(harness.schedulerRegistry.addCronJob).toHaveBeenCalled();
    } finally {
      nowSpy.mockRestore();
      await harness.moduleRef.close();
    }
  });
});
