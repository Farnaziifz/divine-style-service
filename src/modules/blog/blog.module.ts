import { Module } from '@nestjs/common';
import { SharedModule } from '../shared/shared.module';
import { BlogController } from './blog.controller';
import { AdminBlogController } from './admin-blog.controller';

@Module({
  imports: [SharedModule],
  controllers: [BlogController, AdminBlogController],
})
export class BlogModule {}
