import { Module } from '@nestjs/common';
import { SharedModule } from '../shared/shared.module';
import { StyleGameController } from './style-game.controller';
import { StyleGameService } from './style-game.service';
import { GapgptService } from './gapgpt.service';

@Module({
  imports: [SharedModule],
  controllers: [StyleGameController],
  providers: [StyleGameService, GapgptService],
})
export class StyleGameModule {}
