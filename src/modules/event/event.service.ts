import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomInt } from 'node:crypto';
import { Event, Prisma } from '@prisma/client';
import { PrismaService } from '../shared/prisma/prisma.service';
import { CreateEventDto } from './dtos/create-event.dto';
import { UpdateEventDto } from './dtos/update-event.dto';
import { EventQueryDto } from './dtos/event-query.dto';

const EVENT_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const EVENT_CODE_LENGTH = 8;

@Injectable()
export class EventService {
  constructor(private readonly prisma: PrismaService) {}

  private generateEventCodeCandidate(): string {
    let code = '';
    for (let i = 0; i < EVENT_CODE_LENGTH; i++) {
      code += EVENT_CODE_ALPHABET[randomInt(EVENT_CODE_ALPHABET.length)];
    }
    return code;
  }

  private async generateUniqueEventCode(): Promise<string> {
    for (let attempt = 0; attempt < 10; attempt++) {
      const code = this.generateEventCodeCandidate();
      const existing = await this.prisma.event.findUnique({
        where: { eventCode: code },
        select: { id: true },
      });
      if (!existing) return code;
    }
    throw new BadRequestException('ساخت کد یکتای رویداد ناموفق بود، دوباره تلاش کنید');
  }

  private assertDates(startDate: Date, endDate: Date) {
    if (startDate > endDate) {
      throw new BadRequestException('تاریخ پایان باید بعد از تاریخ شروع باشد');
    }
  }

  async create(dto: CreateEventDto) {
    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);
    this.assertDates(startDate, endDate);

    const eventCode = await this.generateUniqueEventCode();

    return this.prisma.event.create({
      data: {
        eventCode,
        name: dto.name.trim(),
        startDate,
        endDate,
      },
    });
  }

  async findAll(query: EventQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const where: Prisma.EventWhereInput = { isDeleted: false };
    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    }
    if (query.search?.trim()) {
      const s = query.search.trim();
      where.OR = [
        { name: { contains: s, mode: 'insensitive' } },
        { eventCode: { contains: s, mode: 'insensitive' } },
      ];
    }

    const [total, data] = await this.prisma.$transaction([
      this.prisma.event.count({ where }),
      this.prisma.event.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        lastPage: Math.ceil(total / limit) || 1,
      },
    };
  }

  async findOne(id: string): Promise<Event> {
    const event = await this.prisma.event.findFirst({
      where: { id, isDeleted: false },
    });
    if (!event) {
      throw new NotFoundException('رویداد یافت نشد');
    }
    return event;
  }

  async findActiveByCode(eventCode: string): Promise<Event> {
    const event = await this.prisma.event.findFirst({
      where: { eventCode, isActive: true, isDeleted: false },
    });
    if (!event) {
      throw new NotFoundException('رویداد یافت نشد');
    }
    return event;
  }

  async update(id: string, dto: UpdateEventDto) {
    const current = await this.findOne(id);

    const startDate = dto.startDate ? new Date(dto.startDate) : current.startDate;
    const endDate = dto.endDate ? new Date(dto.endDate) : current.endDate;
    this.assertDates(startDate, endDate);

    return this.prisma.event.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        startDate,
        endDate,
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
  }

  async updateLogoImage(id: string, url: string | null) {
    await this.findOne(id);
    return this.prisma.event.update({
      where: { id },
      data: { logoImageUrl: url },
    });
  }

  async updateBannerImage(id: string, url: string | null) {
    await this.findOne(id);
    return this.prisma.event.update({
      where: { id },
      data: { bannerImageUrl: url },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.event.update({
      where: { id },
      data: { isDeleted: true, deletedAt: new Date(), isActive: false },
    });
    return { success: true };
  }
}
