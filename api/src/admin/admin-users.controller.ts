import { Body, Controller, Get, HttpCode, Module, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { type AuthUser, CurrentUser } from '../auth/current-user.decorator.js';
import { LEVEL, MinLevel } from '../common/auth/min-level.decorator.js';
import { AdminUsersService } from './admin-users.service.js';
import { ChangeRoleDto, CreateUserDto, ListUsersQuery } from './dto.js';

// Todo el controlador exige nivel admin (3) o más: un usuario, staff o manager
// recibe 403 aunque tenga sesión (OWASP API5). Qué cuentas ve y toca cada nivel
// lo decide el servicio con la jerarquía (OWASP API1).
@MinLevel(LEVEL.admin)
@Controller('admin')
export class AdminUsersController {
  constructor(private readonly users: AdminUsersService) {}

  @Get('roles')
  roles(@CurrentUser() actor: AuthUser) {
    return this.users.roles(actor);
  }

  @Get('users')
  list(@CurrentUser() actor: AuthUser, @Query() query: ListUsersQuery) {
    return this.users.list(actor, query.q, query.page);
  }

  // ParseUUIDPipe: un id que no es UUID se rechaza con 400 antes de llegar a la base.
  @Get('users/:id')
  get(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.users.get(actor, id);
  }

  @Post('users')
  @HttpCode(201)
  create(@CurrentUser() actor: AuthUser, @Body() dto: CreateUserDto) {
    return this.users.create(actor, dto.email, dto.roleName);
  }

  @Patch('users/:id/role')
  changeRole(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ChangeRoleDto) {
    return this.users.changeRole(actor, id, dto.roleName);
  }

  @Post('users/:id/disable')
  @HttpCode(200)
  disable(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.users.setDisabled(actor, id, true);
  }

  @Post('users/:id/enable')
  @HttpCode(200)
  enable(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.users.setDisabled(actor, id, false);
  }
}

@Module({
  imports: [AuthModule],
  controllers: [AdminUsersController],
  providers: [AdminUsersService],
})
export class AdminModule {}
