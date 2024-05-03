import { NgModule } from "@angular/core";
import { Routes, RouterModule } from '@angular/router';
import { DashboardComponent } from "./pages/dashboard/dashboard.component";
import { MainComponent } from './pages/main/main.component';
import { UserComponent } from "./pages/security/users/user/user.component";
import { UserListComponent } from "./pages/security/users/user-list/user-list.component";
import { ProductListComponent } from "./pages/catssales/product-list/product-list.component";
import { ProductComponent } from "./pages/catssales/product/product.component";
import { CustomerListComponent } from "./pages/catssales/customer-list/customer-list.component";
import { FxrateComponent } from "./pages/settings/fxrate/fxrate.component";
import { RoleListComponent } from "./pages/security/roles/role-list/role-list.component";
import { RoleComponent } from "./pages/security/roles/role/role.component";
import { FletesListComponent } from "./pages/operation/fletes-list/fletes-list.component";
import { FletesComponent } from "./pages/operation/fletes/fletes.component";

const routes: Routes = [
    {
      path: '',
      component: MainComponent,
      children: [
        {
          path: 'dashboard',
          component: DashboardComponent
        },
        {
          path: 'users',
          component: UserComponent
        },
        {
          path: 'editUser/:id',
          component: UserComponent
        },
        {
          path: 'userList',
          component: UserListComponent
        },
        {
          path: 'rol',
          component: RoleComponent
        },
        {
          path: 'editRol/:id',
          component: RoleComponent
        },
        {
          path: 'roleList',
          component: RoleListComponent
        },
        {
          path: 'flete',
          component: FletesComponent
        },
        {
          path: 'editFlete/:id',
          component: FletesComponent
        },
        {
          path: 'fleteList',
          component: FletesListComponent
        },
      ]
    }
  ]

@NgModule({
    imports: [
        RouterModule.forChild( routes )
    ],
    exports: [
        RouterModule
    ]
})
export class ProtectedRoutingModule {}
