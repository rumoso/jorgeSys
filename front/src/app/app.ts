import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { MatIconRegistry } from '@angular/material/icon';
import { ThemeService } from './core/services/theme.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: '<router-outlet />'
})
export class App {
  constructor() {
    // Íconos de Material en su variante "outlined" en todo el sistema.
    inject(MatIconRegistry).setDefaultFontSetClass('material-icons-outlined');
    inject(ThemeService);
  }
}
