import { configureStore } from '@reduxjs/toolkit';
import { setupListeners } from '@reduxjs/toolkit/query';
import { communityApi } from '@/store/api';
import { communityGeoApi } from '@/store/geo-api';

export function makeStore() {
  const store = configureStore({
    reducer: {
      [communityApi.reducerPath]: communityApi.reducer,
      [communityGeoApi.reducerPath]: communityGeoApi.reducer,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware().concat(communityApi.middleware, communityGeoApi.middleware),
  });

  setupListeners(store.dispatch);
  return store;
}

export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<AppStore['getState']>;
export type AppDispatch = AppStore['dispatch'];
