import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { Role } from '@dialectiva/db';
import { JwtAuthGuard } from '../../auth/strategies/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { VdclCompilationService } from './vdcl-compilation.service';
import { VdclDraftService } from './vdcl-draft.service';
import { ManifestInspectorService } from './manifest-inspector.service';
import {
  CreateVdclDraftDto,
  InspectManifestDto,
  PreviewInventoryDto,
} from './dto/compilation.dto';

/**
 * Admin-only compilation and manifest inspection.
 *
 * Admin-only on purpose, for this phase. Compilation is the step that
 * decides what a licence covers, and until the contributor-facing maker
 * ships in Phase 3 with its readiness checks and consent capture, the only
 * people who should be triggering it are the ones who can also read the
 * result and explain it.
 *
 * Contributor identity is visible throughout, so this shares the VDCL admin
 * surface's constraint: none of it may be reused for a subscriber- or
 * contributor-facing route.
 */
@Controller('admin/vdcl')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class VdclCompilationController {
  constructor(
    private readonly compilation: VdclCompilationService,
    private readonly drafts: VdclDraftService,
    private readonly inspector: ManifestInspectorService,
  ) {}

  /**
   * What a contributor's licence would cover if compiled now.
   *
   * Runs the same eligibility rules as the real compilation, so the two
   * cannot disagree.
   */
  @Get('inventory')
  previewInventory(@Query() query: PreviewInventoryDto) {
    return this.compilation.previewInventory(query);
  }

  /** Create the agreement (if new) and a draft version with its grants. */
  @Post('drafts')
  createDraft(@Body() dto: CreateVdclDraftDto) {
    return this.drafts.createDraft(dto);
  }

  /**
   * Compile a draft into an immutable manifest.
   *
   * Moves the version to PENDING_REVIEW. It does not sign, countersign or
   * activate -- activation stays a separate, deliberate act.
   */
  @Post('versions/:id/compile')
  compile(@Param('id') id: string) {
    return this.compilation.compileVersion(id);
  }

  /** Manifest contents, metrics, compilation status and any anomalies. */
  @Get('versions/:id/manifest')
  inspect(@Param('id') id: string, @Query() query: InspectManifestDto) {
    return this.inspector.inspect(id, query.page ?? 0);
  }

  /** Every recording left out, with a stated reason for each. */
  @Get('versions/:id/exclusions')
  explainExclusions(@Param('id') id: string) {
    return this.inspector.explainExclusions(id);
  }

  /**
   * Recompute the manifest hash from stored rows and compare it to the one
   * issued. A mismatch means the manifest was altered after signing.
   */
  @Get('versions/:id/verify-hash')
  verifyHash(@Param('id') id: string) {
    return this.inspector.verifyHash(id);
  }
}
