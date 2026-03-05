import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { SharedModule } from '../shared/shared.module';

// Controllers
import { CollectionController } from './presentation/controllers/collection.controller';
import { CategoryController } from './presentation/controllers/category.controller';
import { ProductController } from './presentation/controllers/product.controller';
import { SpecificationController } from './presentation/controllers/specification.controller';

// Repositories
import { PrismaCollectionRepository } from './infrastructure/persistence/prisma-collection.repository';
import { PrismaCategoryRepository } from './infrastructure/persistence/prisma-category.repository';
import { PrismaProductRepository } from './infrastructure/persistence/prisma-product.repository';
import { PrismaSpecificationRepository } from './infrastructure/persistence/prisma-specification.repository';

// Handlers - Collection
import { CreateCollectionHandler } from './application/commands/handlers/create-collection.handler';
import { UpdateCollectionHandler } from './application/commands/handlers/update-collection.handler';
import { DeleteCollectionHandler } from './application/commands/handlers/delete-collection.handler';
import { GetCollectionsHandler } from './application/queries/handlers/get-collections.handler';
import { GetCollectionHandler } from './application/queries/handlers/get-collection.handler';

// Handlers - Category
import { CreateCategoryHandler } from './application/commands/handlers/create-category.handler';
import { UpdateCategoryHandler } from './application/commands/handlers/update-category.handler';
import { DeleteCategoryHandler } from './application/commands/handlers/delete-category.handler';
import { GetCategoriesHandler } from './application/queries/handlers/get-categories.handler';
import { GetCategoryHandler } from './application/queries/handlers/get-category.handler';

// Handlers - Product
import { CreateProductHandler } from './application/commands/handlers/create-product.handler';
import { UpdateProductHandler } from './application/commands/handlers/update-product.handler';
import { DeleteProductHandler } from './application/commands/handlers/delete-product.handler';
import { GetProductsHandler } from './application/queries/handlers/get-products.handler';
import { GetProductHandler } from './application/queries/handlers/get-product.handler';

// Handlers - Specification
import { CreateSpecificationKeyHandler } from './application/commands/handlers/create-specification-key.handler';
import { GetSpecificationKeysHandler } from './application/queries/handlers/get-specification-keys.handler';

@Module({
  imports: [SharedModule, CqrsModule],
  controllers: [
    CollectionController,
    CategoryController,
    ProductController,
    SpecificationController,
  ],
  providers: [
    { provide: 'ICollectionRepository', useClass: PrismaCollectionRepository },
    { provide: 'ICategoryRepository', useClass: PrismaCategoryRepository },
    { provide: 'IProductRepository', useClass: PrismaProductRepository },
    {
      provide: 'ISpecificationRepository',
      useClass: PrismaSpecificationRepository,
    },

    // Collection Handlers
    CreateCollectionHandler,
    UpdateCollectionHandler,
    DeleteCollectionHandler,
    GetCollectionsHandler,
    GetCollectionHandler,

    // Category Handlers
    CreateCategoryHandler,
    UpdateCategoryHandler,
    DeleteCategoryHandler,
    GetCategoriesHandler,
    GetCategoryHandler,

    // Product Handlers
    CreateProductHandler,
    UpdateProductHandler,
    DeleteProductHandler,
    GetProductsHandler,
    GetProductHandler,

    // Specification Handlers
    CreateSpecificationKeyHandler,
    GetSpecificationKeysHandler,
  ],
})
export class CatalogModule {}
