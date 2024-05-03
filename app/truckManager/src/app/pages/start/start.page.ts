import { Component, OnInit } from '@angular/core';
import { NavController } from '@ionic/angular';
import { Pagination } from 'src/app/interfaces/global.interface';
import { AuthService } from 'src/app/services/auth.service';
import { SQLiteService } from 'src/app/services/sqlite.service';
import { UiService } from 'src/app/services/ui.service';

@Component({
  selector: 'app-start',
  templateUrl: './start.page.html',
  styleUrls: ['./start.page.scss'],
})
export class StartPage implements OnInit {

  pagination: Pagination = {
    search: "",
    iRows: 0,
    start: 0,
    limiter: 10
  }

  OSalesList: any = [];

  constructor(
    private SQLite: SQLiteService
    , private authServ: AuthService
    , private navCtrl: NavController
    //, private salesServ: SalesService
    , private uiServ: UiService
  ) {
    
  }

  async ngOnInit() {
    await this.authServ.validaSesion();
    //this.getSalesHeaderListWithPage(this.pagination, null);
    
  }

}
