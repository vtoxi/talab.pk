import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';
import { loadConfig } from './app/core/config';

// settings (Google client ID, map tiles) come from /config.json, so read them before the app starts
loadConfig()
  .then(() => bootstrapApplication(AppComponent, appConfig))
  .catch((err) => console.error(err));
