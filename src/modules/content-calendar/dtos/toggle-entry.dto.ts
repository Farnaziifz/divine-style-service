import { IsBoolean } from 'class-validator';

export class ToggleEntryDto {
  @IsBoolean()
  isDone: boolean;
}
