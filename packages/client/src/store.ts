import { configureStore } from '@reduxjs/toolkit';
import { omnisupportApi } from './api/omnisupportApi';

export const store = configureStore({
  reducer: {
    [omnisupportApi.reducerPath]: omnisupportApi.reducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(omnisupportApi.middleware),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
