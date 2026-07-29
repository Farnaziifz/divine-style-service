import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { UploadController } from './upload.controller';

@Module({
  imports: [JwtModule.register({})],
  controllers: [UploadController],
})
export class UploadModule {}
