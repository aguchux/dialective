import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@dialectiva/db';
import { JwtAuthGuard } from '../auth/strategies/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CreateMarketingHeadlineDto } from './dto/create-marketing-headline.dto';
import { CreateMarketingPhotoDto } from './dto/create-marketing-photo.dto';
import { CreateMarketingUploadUrlDto } from './dto/create-marketing-upload-url.dto';
import { MarketingFormatQueryDto } from './dto/marketing-format-query.dto';
import { UpdateMarketingHeadlineDto } from './dto/update-marketing-headline.dto';
import { UpdateMarketingPhotoDto } from './dto/update-marketing-photo.dto';
import { MarketingService } from './marketing.service';

@Controller('admin/marketing')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminMarketingController {
  constructor(private readonly marketing: MarketingService) {}

  @Post('photos/upload-url')
  createUploadUrl(@Body() dto: CreateMarketingUploadUrlDto) {
    return this.marketing.createUploadUrl(dto);
  }

  @Post('photos')
  createPhoto(@Body() dto: CreateMarketingPhotoDto) {
    return this.marketing.createPhoto(dto);
  }

  @Get('photos')
  listPhotos(@Query() query: MarketingFormatQueryDto) {
    return this.marketing.listPhotosAdmin(query.format);
  }

  @Patch('photos/:id')
  updatePhoto(@Param('id') id: string, @Body() dto: UpdateMarketingPhotoDto) {
    return this.marketing.updatePhoto(id, dto);
  }

  @Delete('photos/:id')
  deletePhoto(@Param('id') id: string) {
    return this.marketing.deletePhoto(id);
  }

  @Post('headlines')
  createHeadline(@Body() dto: CreateMarketingHeadlineDto) {
    return this.marketing.createHeadline(dto);
  }

  @Get('headlines')
  listHeadlines(@Query() query: MarketingFormatQueryDto) {
    return this.marketing.listHeadlinesAdmin(query.format);
  }

  @Patch('headlines/:id')
  updateHeadline(@Param('id') id: string, @Body() dto: UpdateMarketingHeadlineDto) {
    return this.marketing.updateHeadline(id, dto);
  }

  @Delete('headlines/:id')
  deleteHeadline(@Param('id') id: string) {
    return this.marketing.deleteHeadline(id);
  }
}
