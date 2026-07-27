import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { DealerProductResponse, ProductsService } from './products.service';

@ApiBearerAuth()
@ApiTags('Products')
@Controller({ path: 'products', version: '1' })
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'List active catalogue products' })
  @ApiOkResponse({
    description: 'Active products with their category summary.',
    schema: {
      example: {
        success: true,
        data: [
          {
            id: 'uuid',
            sku: 'ILTT-18060-PRO',
            name: 'ILTT 18060 PRO',
            isActive: true,
            category: { id: 'uuid', name: 'Battery Inverters' },
          },
        ],
      },
    },
  })
  findAll(): Promise<DealerProductResponse[]> {
    return this.productsService.findAll();
  }
}
