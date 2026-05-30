import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from "@nestjs/common";
import { SchedulerRegistry } from "@nestjs/schedule";
import { CronJob, CronTime } from "cron";
import {
  SchedulerConcurrencyPolicy,
  type SchedulerJob,
  SchedulerJobLogStatus,
  SchedulerJobStatus,
  SchedulerMisfirePolicy,
} from "../../../../generated/prisma/client";
import { AppConfigService } from "../../../shared/config/app-config.service";
import type { CreateSchedulerJobDto } from "../dto/create-scheduler-job.dto";
import type { QuerySchedulerJobLogsDto } from "../dto/query-scheduler-job-logs.dto";
import type { QuerySchedulerJobsDto } from "../dto/query-scheduler-jobs.dto";
import type { UpdateSchedulerJobDto } from "../dto/update-scheduler-job.dto";
import { SchedulerRepository } from "../infrastructure/scheduler.repository";
import {
  SchedulerExecutorRegistry,
  type SchedulerExecutorResult,
} from "../infrastructure/scheduler-executor.registry";

const MAX_EXECUTION_MESSAGE_LENGTH = 4000;
const DATABASE_BACKUP_JOB_NAME = "每周数据库全量备份";
const DATABASE_BACKUP_INVOKE_TARGET = "database.full-backup";
const DATABASE_BACKUP_CRON_EXPRESSION = "0 30 2 * * 0";
const DATABASE_BACKUP_JOB_REMARK =
  "每周日 02:30 执行数据库全量备份；目录、命令、保留份数通过系统参数维护。";
const DATABASE_BACKUP_LEGACY_JOB_REMARK =
  "每周日 02:30 执行数据库全量备份；默认保留最近 2 个全量备份，可通过 DATABASE_BACKUP_RETENTION_FULL_COUNT 调整。";

@Injectable()
export class SchedulerService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(SchedulerService.name);
  private readonly runningJobs = new Set<number>();
  private readonly registeredRuntimeJobIds = new Set<number>();

  constructor(
    private readonly appConfigService: AppConfigService,
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly schedulerRepository: SchedulerRepository,
    private readonly schedulerExecutorRegistry: SchedulerExecutorRegistry,
  ) {}

  onModuleDestroy(): void {
    for (const jobId of this.registeredRuntimeJobIds) {
      this.removeRuntimeJob(jobId);
    }
  }

  async onApplicationBootstrap(): Promise<void> {
    if (!this.appConfigService.schedulerEnabled) {
      return;
    }

    await this.ensureDefaultDatabaseBackupJob();

    const jobs = await this.schedulerRepository.listActiveJobs();
    for (const job of jobs) {
      if (this.shouldRunMisfireCatchUp(job)) {
        await this.executeJob(job, "scheduled");
      }
      await this.syncRuntimeJob(job);
    }
  }

  private async ensureDefaultDatabaseBackupJob(): Promise<void> {
    const existingByInvokeTarget =
      await this.schedulerRepository.findJobByInvokeTarget(
        DATABASE_BACKUP_INVOKE_TARGET,
      );
    if (existingByInvokeTarget) {
      if (
        !existingByInvokeTarget.remark ||
        existingByInvokeTarget.remark === DATABASE_BACKUP_LEGACY_JOB_REMARK
      ) {
        await this.schedulerRepository.updateJob(existingByInvokeTarget.id, {
          remark: DATABASE_BACKUP_JOB_REMARK,
        });
      }
      return;
    }

    const existingByName = await this.schedulerRepository.findJobByName(
      DATABASE_BACKUP_JOB_NAME,
    );
    if (existingByName) {
      return;
    }

    await this.schedulerRepository.createJob({
      jobName: DATABASE_BACKUP_JOB_NAME,
      invokeTarget: DATABASE_BACKUP_INVOKE_TARGET,
      cronExpression: DATABASE_BACKUP_CRON_EXPRESSION,
      concurrencyPolicy: SchedulerConcurrencyPolicy.FORBID,
      misfirePolicy: SchedulerMisfirePolicy.SKIP,
      remark: DATABASE_BACKUP_JOB_REMARK,
      status: this.appConfigService.databaseBackupDefaultEnabled
        ? SchedulerJobStatus.ACTIVE
        : SchedulerJobStatus.PAUSED,
      createdBy: "system-bootstrap",
      updatedBy: "system-bootstrap",
    });
  }

  async listJobs(query: QuerySchedulerJobsDto) {
    const result = await this.schedulerRepository.findJobs({
      keyword: query.keyword,
      status: query.status,
      limit: Math.min(query.limit ?? 50, 100),
      offset: query.offset ?? 0,
    });

    return {
      ...result,
      availableExecutors: this.schedulerExecutorRegistry.listExecutors(),
    };
  }

  async getJobById(id: number) {
    return this.getRequiredJob(id);
  }

  async listJobLogs(query: QuerySchedulerJobLogsDto) {
    return this.schedulerRepository.findJobLogs({
      jobName: query.jobName,
      status: query.status,
      limit: Math.min(query.limit ?? 50, 100),
      offset: query.offset ?? 0,
    });
  }

  async createJob(dto: CreateSchedulerJobDto, operatorName?: string) {
    await this.ensureJobNameAvailable(dto.jobName);
    this.validateInvokeTarget(dto.invokeTarget);
    this.validateCronExpression(dto.cronExpression);

    const created = await this.schedulerRepository.createJob({
      jobName: dto.jobName,
      invokeTarget: dto.invokeTarget,
      cronExpression: dto.cronExpression,
      concurrencyPolicy: dto.concurrencyPolicy,
      misfirePolicy: dto.misfirePolicy,
      remark: dto.remark,
      status: SchedulerJobStatus.ACTIVE,
      createdBy: operatorName,
      updatedBy: operatorName,
    });

    try {
      await this.syncRuntimeJob(created);
      return created;
    } catch (error) {
      await this.safeDeleteJob(created.id);
      throw error;
    }
  }

  async updateJob(
    id: number,
    dto: UpdateSchedulerJobDto,
    operatorName?: string,
  ) {
    const existing = await this.getRequiredJob(id);
    const nextJobName = dto.jobName ?? existing.jobName;
    if (nextJobName !== existing.jobName) {
      await this.ensureJobNameAvailable(nextJobName);
    }

    const nextInvokeTarget = dto.invokeTarget ?? existing.invokeTarget;
    const nextCronExpression = dto.cronExpression ?? existing.cronExpression;
    this.validateInvokeTarget(nextInvokeTarget);
    this.validateCronExpression(nextCronExpression);

    const updated = await this.schedulerRepository.updateJob(id, {
      jobName: dto.jobName,
      invokeTarget: dto.invokeTarget,
      cronExpression: dto.cronExpression,
      concurrencyPolicy: dto.concurrencyPolicy,
      misfirePolicy: dto.misfirePolicy,
      remark: dto.remark,
      updatedBy: operatorName,
    });

    try {
      await this.syncRuntimeJob(updated);
      return updated;
    } catch (error) {
      await this.restoreJob(existing);
      throw error;
    }
  }

  async pauseJob(id: number, operatorName?: string) {
    const existing = await this.getRequiredJob(id);
    if (existing.status === SchedulerJobStatus.PAUSED) {
      return existing;
    }

    const updated = await this.schedulerRepository.updateJob(id, {
      status: SchedulerJobStatus.PAUSED,
      updatedBy: operatorName,
    });

    try {
      await this.syncRuntimeJob(updated);
      return updated;
    } catch (error) {
      await this.restoreJob(existing);
      throw error;
    }
  }

  async resumeJob(id: number, operatorName?: string) {
    const existing = await this.getRequiredJob(id);
    if (existing.status === SchedulerJobStatus.ACTIVE) {
      return existing;
    }

    const updated = await this.schedulerRepository.updateJob(id, {
      status: SchedulerJobStatus.ACTIVE,
      updatedBy: operatorName,
    });

    try {
      await this.syncRuntimeJob(updated);
      return updated;
    } catch (error) {
      await this.restoreJob(existing);
      throw error;
    }
  }

  async runJobNow(id: number) {
    const job = await this.getRequiredJob(id);
    const execution = await this.executeJob(job, "manual");
    return {
      job,
      executionLog: execution,
    };
  }

  private async getRequiredJob(id: number): Promise<SchedulerJob> {
    const job = await this.schedulerRepository.findJobById(id);
    if (!job) {
      throw new BadRequestException(`调度任务不存在: ${id}`);
    }

    return job;
  }

  private async ensureJobNameAvailable(jobName: string): Promise<void> {
    const existing = await this.schedulerRepository.findJobByName(jobName);
    if (existing) {
      throw new ConflictException(`调度任务名称已存在: ${jobName}`);
    }
  }

  private validateInvokeTarget(invokeTarget: string): void {
    if (!this.schedulerExecutorRegistry.hasExecutor(invokeTarget)) {
      throw new BadRequestException(`非法 invokeTarget: ${invokeTarget}`);
    }
  }

  private validateCronExpression(cronExpression: string): void {
    const validation = CronTime.validateCronExpression(cronExpression);
    if (!validation.valid) {
      throw new BadRequestException(`Cron 表达式非法: ${cronExpression}`);
    }
  }

  private async syncRuntimeJob(job: SchedulerJob): Promise<void> {
    this.removeRuntimeJob(job.id);

    if (
      !this.appConfigService.schedulerEnabled ||
      job.status !== SchedulerJobStatus.ACTIVE
    ) {
      return;
    }

    const runtimeJob = new CronJob(
      job.cronExpression,
      () => {
        void this.executeJob(job, "scheduled");
      },
      null,
      false,
      this.appConfigService.schedulerTimezone,
    );

    this.schedulerRegistry.addCronJob(
      this.getRuntimeJobName(job.id),
      runtimeJob,
    );
    this.registeredRuntimeJobIds.add(job.id);
    runtimeJob.start();
  }

  private removeRuntimeJob(jobId: number): void {
    const runtimeJobName = this.getRuntimeJobName(jobId);
    try {
      this.schedulerRegistry.deleteCronJob(runtimeJobName);
      this.registeredRuntimeJobIds.delete(jobId);
    } catch {
      // No runtime job is registered yet.
    }
  }

  private getRuntimeJobName(jobId: number): string {
    return `scheduler-job-${jobId}`;
  }

  private shouldRunMisfireCatchUp(job: SchedulerJob): boolean {
    if (job.misfirePolicy !== SchedulerMisfirePolicy.FIRE_AND_PROCEED) {
      return false;
    }

    const referenceTime = job.lastRunAt ?? job.createdAt;

    try {
      const cronTime = new CronTime(
        job.cronExpression,
        this.appConfigService.schedulerTimezone,
      );
      const nextScheduledAt = cronTime.getNextDateFrom(referenceTime);
      return nextScheduledAt.toMillis() <= Date.now();
    } catch {
      return false;
    }
  }

  private async executeJob(
    job: SchedulerJob,
    triggerMode: "manual" | "scheduled",
  ) {
    if (
      job.concurrencyPolicy === SchedulerConcurrencyPolicy.FORBID &&
      this.runningJobs.has(job.id)
    ) {
      const log = await this.writeExecutionLog({
        job,
        status: SchedulerJobLogStatus.FAILURE,
        startedAt: new Date(),
        finishedAt: new Date(),
        durationMs: 0,
        message: `Skipped ${triggerMode} execution because another run is active.`,
      });

      if (triggerMode === "manual") {
        throw new BadRequestException("任务正在执行中");
      }

      return log;
    }

    this.runningJobs.add(job.id);
    const startedAt = new Date();

    try {
      const result = await this.schedulerExecutorRegistry.runExecutor(
        job.invokeTarget,
      );
      const finishedAt = new Date();

      await this.schedulerRepository.updateJob(job.id, {
        lastRunAt: finishedAt,
      });

      return this.writeExecutionLog({
        job,
        status: SchedulerJobLogStatus.SUCCESS,
        startedAt,
        finishedAt,
        durationMs: finishedAt.getTime() - startedAt.getTime(),
        message: this.buildExecutionMessage(triggerMode, result),
      });
    } catch (error) {
      const finishedAt = new Date();
      const errorMessage =
        error instanceof Error ? error.message : "unknown scheduler error";

      await this.writeExecutionLog({
        job,
        status: SchedulerJobLogStatus.FAILURE,
        startedAt,
        finishedAt,
        durationMs: finishedAt.getTime() - startedAt.getTime(),
        message: `Scheduler job execution failed during ${triggerMode} trigger.`,
        errorMessage,
      });

      if (triggerMode === "manual") {
        throw new InternalServerErrorException(`任务执行失败: ${errorMessage}`);
      }

      this.logger.warn(
        `Scheduler job ${job.jobName} failed during ${triggerMode} execution: ${errorMessage}`,
      );
      return null;
    } finally {
      this.runningJobs.delete(job.id);
    }
  }

  private buildExecutionMessage(
    triggerMode: "manual" | "scheduled",
    result: SchedulerExecutorResult,
  ): string {
    const payload =
      typeof result.payload === "undefined"
        ? ""
        : ` payload=${JSON.stringify(result.payload)}`;
    const rawMessage = `[${triggerMode}] ${result.summary}${payload}`;
    return rawMessage.length > MAX_EXECUTION_MESSAGE_LENGTH
      ? `${rawMessage.slice(0, MAX_EXECUTION_MESSAGE_LENGTH)}...[TRUNCATED]`
      : rawMessage;
  }

  private async writeExecutionLog(params: {
    job: SchedulerJob;
    status: SchedulerJobLogStatus;
    startedAt: Date;
    finishedAt: Date;
    durationMs: number;
    message?: string;
    errorMessage?: string;
  }) {
    return this.schedulerRepository.createJobLog({
      jobId: params.job.id,
      jobName: params.job.jobName,
      invokeTarget: params.job.invokeTarget,
      status: params.status,
      message: params.message,
      errorMessage: params.errorMessage,
      durationMs: params.durationMs,
      startedAt: params.startedAt,
      finishedAt: params.finishedAt,
    });
  }

  private async restoreJob(job: SchedulerJob): Promise<void> {
    await this.schedulerRepository.updateJob(job.id, {
      jobName: job.jobName,
      invokeTarget: job.invokeTarget,
      cronExpression: job.cronExpression,
      status: job.status,
      concurrencyPolicy: job.concurrencyPolicy,
      misfirePolicy: job.misfirePolicy,
      remark: job.remark,
      lastRunAt: job.lastRunAt,
      updatedBy: job.updatedBy,
    });
    await this.syncRuntimeJob(job);
  }

  private async safeDeleteJob(id: number): Promise<void> {
    try {
      this.removeRuntimeJob(id);
      await this.schedulerRepository.deleteJob(id);
    } catch {
      // Best-effort cleanup after runtime registration failure.
    }
  }
}
