import * as TaskManager from 'expo-task-manager';
import type * as Location from 'expo-location';
import { engine, LOCATION_TASK } from './engine';

// Must be defined at module scope (imported from index.ts) so Android can run it
// from the foreground service even when the UI isn't mounted.
TaskManager.defineTask(LOCATION_TASK, async ({ data, error }) => {
  if (error) return;
  await engine.ready;
  const { locations } = (data || {}) as { locations?: Location.LocationObject[] };
  if (engine.S.running && locations?.length) engine.onLocations(locations);
});
