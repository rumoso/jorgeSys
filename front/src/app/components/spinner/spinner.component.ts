import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';

@Component({
    selector: 'app-spinner',
    templateUrl: './spinner.component.html',
    styleUrls: ['./spinner.component.css'],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class SpinnerComponent implements OnInit {

  // VARIABLES PARA EL SPINNER
  diameter: number = 100;
  strokeWidth : number = 10;
  bProgressSpinner: boolean = true;
  color: string = "success";
  //-------------------------------

  constructor() { }

  ngOnInit(): void {
  }

}
