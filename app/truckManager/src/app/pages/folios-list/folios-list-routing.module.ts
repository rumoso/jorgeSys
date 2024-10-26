import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { FoliosListPage } from './folios-list.page';

const routes: Routes = [
  {
    path: '',
    component: FoliosListPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class FoliosListPageRoutingModule {}
