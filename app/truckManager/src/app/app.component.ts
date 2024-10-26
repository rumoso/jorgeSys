import { Component } from '@angular/core';
import { Platform } from '@ionic/angular';
import { Location } from '@angular/common';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
})
export class AppComponent {

  constructor(private platform: Platform, private location: Location) {
    this.initializeApp();
  }

  initializeApp() {
    this.platform.ready().then(() => {
      this.platform.backButton.subscribeWithPriority(10, () => {
        // Navegar a la página anterior si el botón de retroceso es presionado
        this.location.back();
      });
    });
  }

}
