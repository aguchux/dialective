import { configureStore } from '@reduxjs/toolkit';
import { setupListeners } from '@reduxjs/toolkit/query';
import { streamApi } from '@/store/api';

export function makeStore() {
  const store = configureStore({
    reducer: {
      [streamApi.reducerPath]: streamApi.reducer,
    },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(streamApi.middleware),
  });

  setupListeners(store.dispatch);
  return store;
}

export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<AppStore['getState']>;
export type AppDispatch = AppStore['dispatch'];
