import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Navigate, RouterProvider, createBrowserRouter } from 'react-router';
import { Toaster } from 'sonner';
import { ProtectedLayout, RequirePermission } from './components/Layout';
import { AccountPage } from './features/auth/AccountPage';
import { LoginPage } from './features/auth/LoginPage';
import { AuditPage } from './features/audit/AuditPage';
import { BrandsPage } from './features/brands/BrandsPage';
import { PageEditorPage } from './features/editor/PageEditorPage';
import { MediaPage } from './features/media/MediaPage';
import { OccasionsPage } from './features/occasions/OccasionsPage';
import { PagesListPage } from './features/pages/PagesListPage';
import { SiteSettingsPage } from './features/settings/SiteSettingsPage';
import { TemplatesPage } from './features/templates/TemplatesPage';
import { UsersPage } from './features/users/UsersPage';
import { ApiError } from './lib/api';
import { AuthProvider } from './lib/auth';
import './styles.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: false,
      retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
    },
  },
});

const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: <ProtectedLayout />,
    children: [
      { index: true, element: <Navigate to="/pages" replace /> },
      { path: '/pages', element: <PagesListPage /> },
      { path: '/pages/:id', element: <PageEditorPage /> },
      { path: '/brands', element: <BrandsPage /> },
      { path: '/media', element: <MediaPage /> },
      { path: '/templates', element: <TemplatesPage /> },
      { path: '/occasions', element: <OccasionsPage /> },
      { path: '/settings', element: <SiteSettingsPage /> },
      { path: '/account', element: <AccountPage /> },
      { path: '/users', element: <RequirePermission permission="users.manage"><UsersPage /></RequirePermission> },
      { path: '/audit', element: <RequirePermission permission="audit.read"><AuditPage /></RequirePermission> },
      { path: '*', element: <Navigate to="/pages" replace /> },
    ],
  },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouterProvider router={router} />
        <Toaster position="bottom-right" richColors closeButton />
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);
