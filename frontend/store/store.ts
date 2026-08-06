import { configureStore } from '@reduxjs/toolkit';
import { setupListeners } from '@reduxjs/toolkit/query';
import { dialectivaApi } from '@/store/api';

export function makeStore() {
  const store = configureStore({
    reducer: {
      [dialectivaApi.reducerPath]: dialectivaApi.reducer,
    },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(dialectivaApi.middleware),
  });

  setupListeners(store.dispatch);
  return store;
}

export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<AppStore['getState']>;
export type AppDispatch = AppStore['dispatch'];
