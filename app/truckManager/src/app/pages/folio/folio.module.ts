import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { FolioPageRoutingModule } from './folio-routing.module';

import { FolioPage } from './folio.page';
import { ComponentsModule } from 'src/app/components/components.module';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    FolioPageRoutingModule,
    ComponentsModule
  ],
  declarations: [FolioPage]
})
export class FolioPageModule {}
