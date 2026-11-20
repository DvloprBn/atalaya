import { Controller, Get, Global, Module } from '@nestjs/common';
import { AnalysesModule } from '../analyses/analyses.controller.js';
import { Public } from '../common/auth/public.decorator.js';
import { UploadStorage } from '../uploads/upload-storage.js';
import { DemoSweeper } from './demo-sweeper.js';
import { type DemoInfo, DemoService } from './demo.service.js';

@Controller('demo')
export class DemoController {
  constructor(private readonly demo: DemoService) {}

  /** Público: el registro y la subida necesitan saber, antes de tener cuenta, si esto es la demo y cuáles son sus límites. */
  @Public()
  @Get()
  info(): DemoInfo {
    return this.demo.info();
  }
}

// Global: el registro, Google, la invitación, las subidas y los análisis consultan sus reglas.
@Global()
@Module({
  imports: [AnalysesModule], // ResultsStorage: el barrido retira los CSV de los análisis
  controllers: [DemoController],
  providers: [DemoService, DemoSweeper, UploadStorage],
  exports: [DemoService],
})
export class DemoModule {}
