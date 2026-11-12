import { Component, Inject, ChangeDetectionStrategy } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { DDialog } from 'src/app/interfaces/general.interfaces';

@Component({
    selector: 'app-alert',
    templateUrl: './alert.component.html',
    styleUrls: ['./alert.component.css'],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class AlertComponent {

  constructor(
    private dialogRef: MatDialogRef<AlertComponent>
    ,@Inject(MAT_DIALOG_DATA) public data: any
  ) { }

  ngOnInit(): void {

  if(this.data.type == 'S'){
    setTimeout (() => {
      this.close();
    }, 3000);
  }

  }

  delete(){
    this.dialogRef.close(true);
  }

  close(){
    this.dialogRef.close();
  }
}
