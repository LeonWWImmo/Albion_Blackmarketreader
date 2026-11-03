// Imported first in main.tsx, so the reporter also catches errors thrown while the app's modules load.
import { installErrorReporter } from "./shared/errorReporter";

installErrorReporter();
