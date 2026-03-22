import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit() {
    await this.$connect();

    this.$use(async (params, next) => {
      const modelsWithSoftDelete = [
        'User',
        'Category',
        'Collection',
        'SpecificationKey',
        'Product',
        'ProductVariant',
        'ProductReview',
        'Order',
        'DiscountCode',
      ];

      if (params.model && modelsWithSoftDelete.includes(params.model)) {
        if (!params.args) {
          params.args = {};
        }

        if (params.action === 'delete') {
          params.action = 'update';
          params.args['data'] = { isDeleted: true, deletedAt: new Date() };
        }
        if (params.action === 'deleteMany') {
          params.action = 'updateMany';
          if (params.args.data !== undefined) {
            params.args.data['isDeleted'] = true;
            params.args.data['deletedAt'] = new Date();
          } else {
            params.args['data'] = { isDeleted: true, deletedAt: new Date() };
          }
        }

        if (
          ['findUnique', 'findFirst', 'findMany', 'count'].includes(
            params.action,
          )
        ) {
          if (params.action === 'findUnique') {
            params.action = 'findFirst';
            params.args.where = { ...params.args.where, isDeleted: false };
          } else {
            if (params.args.where) {
              if (params.args.where.isDeleted === undefined) {
                params.args.where['isDeleted'] = false;
              }
            } else {
              params.args['where'] = { isDeleted: false };
            }
          }
        }
      }
      return next(params);
    });
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
