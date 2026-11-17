import {ChangeDetectionStrategy, Component, effect, inject} from '@angular/core';
import {MatIconModule} from '@angular/material/icon';
import {DashboardView} from './components/dashboard-view';
import {MeasurementLogView} from './components/measurement-log-view';
import {NewProtocolModal} from './components/new-protocol-modal';
import {NormParametersView} from './components/norm-parameters-view';
import {NotificationsView} from './components/notifications-view';
import {PrintProtocolModal} from './components/print-protocol-modal';
import {ServerInstallModal} from './components/server-install-modal';
import {PwaPushService} from './services/pwa-push';
import {HeatingState} from './state/heating-state';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-root',
  imports: [
    MatIconModule,
    DashboardView,
    NormParametersView,
    MeasurementLogView,
    NotificationsView,
    NewProtocolModal,
    PrintProtocolModal,
    ServerInstallModal,
  ],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  readonly state = inject(HeatingState);
  readonly pwa = inject(PwaPushService);

  constructor() {
    effect(() => {
      const protocol = this.state.activeProtocol();
      const settings = this.state.notificationSettings();
      if (this.pwa.pushSubscribed()) {
        void this.pwa.syncPushSchedule(protocol, settings);
      }
    });
  }
}
