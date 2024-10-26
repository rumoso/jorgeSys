import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

import { MaterialModule } from "../material/material.module";
import { ProtectedRoutingModule } from './protected-routing.module';
import { MainComponent } from './pages/main/main.component';
import { DashboardComponent } from './pages/dashboard/dashboard.component';

import { ComponentsModule } from '../components/components.module';
import { UserListComponent } from './pages/security/users/user-list/user-list.component';
import { UserComponent } from "./pages/security/users/user/user.component";
import { CustomerListComponent } from './pages/catssales/customer-list/customer-list.component';
import { CustomerComponent } from './pages/catssales/customer/customer.component';
import { ActionsComponent } from './pages/security/users/mdl/actions/actions.component';
import { RoleComponent } from './pages/security/roles/role/role.component';
import { RoleListComponent } from './pages/security/roles/role-list/role-list.component';
import { ActionAuthorizationComponent } from './pages/security/users/mdl/action-authorization/action-authorization.component';
import { ActionsconfComponent } from './pages/security/mdl/actionsconf/actionsconf.component';
import { MenupermisosComponent } from './pages/security/mdl/menupermisos/menupermisos.component';
import { FletesListComponent } from './pages/operation/fletes-list/fletes-list.component';
import { FletesComponent } from './pages/operation/fletes/fletes.component';
import { CargadescargaComponent } from './pages/operation/mdl/cargadescarga/cargadescarga.component';
import { FolioComponent } from './pages/operation/mdl/folio/folio.component';

@NgModule({
    declarations: [
    MainComponent,
    DashboardComponent,
    UserListComponent,
    UserComponent,
    CustomerListComponent,
    CustomerComponent,
    ActionsComponent,
    RoleComponent,
    RoleListComponent,
    ActionAuthorizationComponent,
    ActionsconfComponent,
    MenupermisosComponent,
    FletesListComponent,
    FletesComponent,
    CargadescargaComponent,
    FolioComponent,
  ],
    imports: [
        CommonModule,
        ReactiveFormsModule,
        FormsModule,
        MaterialModule,
        ProtectedRoutingModule,
        ComponentsModule
    ]
})
export class ProtectedModule {}