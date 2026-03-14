import { Global, Module } from "@nestjs/common";
import { RedisStoreService } from "./redis-store.service";

@Global()
@Module({
  providers: [RedisStoreService],
  exports: [RedisStoreService],
})
export class RedisModule {}
