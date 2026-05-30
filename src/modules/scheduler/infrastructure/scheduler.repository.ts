import { Injectable, NotFoundException } from "@nestjs/common";
import {
  type Prisma,
  type SchedulerJob,
  SchedulerJobLogStatus,
  SchedulerJobStatus,
} from "../../../../generated/prisma/client";
import { PrismaService } from "../../../shared/prisma/prisma.service";

@Injectable()
export class SchedulerRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findJobs(params: {
    keyword?: string;
    status?: SchedulerJobStatus;
    limit: number;
    offset: number;
  }): Promise<{ items: SchedulerJob[]; total: number }> {
    const where: Prisma.SchedulerJobWhereInput = {
      status: params.status,
      OR: params.keyword
        ? [
            {
              jobName: {
                contains: params.keyword,
              },
            },
            {
              invokeTarget: {
                contains: params.keyword,
              },
            },
          ]
        : undefined,
    };

    const [items, total] = await Promise.all([
      this.prisma.schedulerJob.findMany({
        where,
        take: params.limit,
        skip: params.offset,
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      }),
      this.prisma.schedulerJob.count({ where }),
    ]);

    return {
      total,
      items,
    };
  }

  async listActiveJobs(): Promise<SchedulerJob[]> {
    return this.prisma.schedulerJob.findMany({
      where: {
        status: SchedulerJobStatus.ACTIVE,
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    });
  }

  async findJobById(id: number): Promise<SchedulerJob | null> {
    return this.prisma.schedulerJob.findUnique({
      where: { id },
    });
  }

  async findJobByName(jobName: string): Promise<SchedulerJob | null> {
    return this.prisma.schedulerJob.findFirst({
      where: { jobName },
    });
  }

  async findJobByInvokeTarget(
    invokeTarget: string,
  ): Promise<SchedulerJob | null> {
    return this.prisma.schedulerJob.findFirst({
      where: { invokeTarget },
      orderBy: [{ id: "asc" }],
    });
  }

  async createJob(data: Prisma.SchedulerJobUncheckedCreateInput) {
    return this.prisma.schedulerJob.create({ data });
  }

  async updateJob(id: number, data: Prisma.SchedulerJobUncheckedUpdateInput) {
    const existing = await this.findJobById(id);
    if (!existing) {
      throw new NotFoundException(`调度任务不存在: ${id}`);
    }

    return this.prisma.schedulerJob.update({
      where: { id },
      data,
    });
  }

  async deleteJob(id: number) {
    return this.prisma.schedulerJob.delete({
      where: { id },
    });
  }

  async createJobLog(data: Prisma.SchedulerJobLogUncheckedCreateInput) {
    return this.prisma.schedulerJobLog.create({ data });
  }

  async findJobLogs(params: {
    jobName?: string;
    status?: SchedulerJobLogStatus;
    limit: number;
    offset: number;
  }) {
    const where: Prisma.SchedulerJobLogWhereInput = {
      status: params.status,
      jobName: params.jobName
        ? {
            contains: params.jobName,
          }
        : undefined,
    };

    const [items, total] = await Promise.all([
      this.prisma.schedulerJobLog.findMany({
        where,
        take: params.limit,
        skip: params.offset,
        orderBy: [{ startedAt: "desc" }, { id: "desc" }],
      }),
      this.prisma.schedulerJobLog.count({ where }),
    ]);

    return {
      total,
      items,
    };
  }
}
