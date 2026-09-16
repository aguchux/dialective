import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Role } from '@dialectiva/db';
import { JwtAuthGuard } from '../auth/strategies/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { PaymentMethodsService } from './payment-methods.service';
import {
  CreatePaymentMethodCatalogDto,
  CreatePaymentMethodLogoUploadUrlDto,
  ListPaymentMethodsDto,
  UpdatePaymentMethodCatalogDto,
} from './dto/payment-methods.dto';

@Controller('payment-methods')
@UseGuards(JwtAuthGuard)
export class PaymentMethodsController {
  constructor(private readonly paymentMethods: PaymentMethodsService) {}

  @Get()
  list(@Query() query: ListPaymentMethodsDto) {
    return this.paymentMethods.list(query);
  }

  @Get('admin')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  adminList() {
    return this.paymentMethods.listAllForAdmin();
  }

  @Post('admin')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  adminCreate(@Body() body: CreatePaymentMethodCatalogDto) {
    return this.paymentMethods.create(body);
  }

  @Patch('admin/:id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  adminUpdate(@Param('id') id: string, @Body() body: UpdatePaymentMethodCatalogDto) {
    return this.paymentMethods.update(id, body);
  }

  @Delete('admin/:id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  adminDelete(@Param('id') id: string) {
    return this.paymentMethods.delete(id);
  }

  @Post('admin/:id/logo/upload-url')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  adminCreateLogoUploadUrl(
    @Param('id') id: string,
    @Body() body: CreatePaymentMethodLogoUploadUrlDto,
  ) {
    return this.paymentMethods.createLogoUploadUrl(id, body);
  }

  @Post('admin/:id/logo/confirm')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  adminConfirmLogoUpload(@Param('id') id: string, @Body('key') key: string) {
    return this.paymentMethods.confirmLogoUpload(id, key);
  }
}
