import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaService } from './prisma/prisma.service';
import { MinioService } from './minio/minio.service';
import { SmsTextService } from './sms/sms-text.service';

@Global()
@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  providers: [PrismaService, MinioService, SmsTextService],
  exports: [PrismaService, MinioService, SmsTextService],
})
export class SharedModule {}
