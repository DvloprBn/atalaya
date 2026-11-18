import { Global, Module } from '@nestjs/common';
import { CspController } from './csp.controller.js';
import { SecurityController } from './security.controller.js';
import { SecurityLog } from './security-log.service.js';
import { SecurityReadService } from './security-read.service.js';

// Global: cualquier módulo puede inyectar SecurityLog sin importarlo (la bitácora es transversal).
@Global()
@Module({
  controllers: [SecurityController, CspController],
  providers: [SecurityLog, SecurityReadService],
  exports: [SecurityLog],
})
export class SecurityModule {}
