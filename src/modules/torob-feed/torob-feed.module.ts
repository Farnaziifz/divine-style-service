import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TorobFeedController } from './torob-feed.controller';
import { TorobFeedService } from './torob-feed.service';
import { TorobTokenGuard } from './guards/torob-token.guard';

@Module({
  imports: [JwtModule.register({})],
  controllers: [TorobFeedController],
  providers: [TorobFeedService, TorobTokenGuard],
})
export class TorobFeedModule {}
