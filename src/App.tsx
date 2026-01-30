import { Component, Show, onMount, createEffect } from 'solid-js';
import { Router, Route, Navigate, useNavigate } from '@solidjs/router';
import { authState, initializeAuth, logout, isAuthenticated, userDisplayName, updateDisplayName } from '@/store/auth';
import { showToast } from '@/store/ui';
import { Toast, ConfirmModal, DeviceLimitModal, Button } from '@/components';
import { Login, Dashboard, Order, History, JobDetail, Inventory, InventoryLogs, Customers, Services } from '@/routes';

// Layout Component with Nav
const Layout: Component<{ children?: any }> = (props) => {
  const navigate = useNavigate();

  const handleEditDisplayName = async () => {
    const newName = prompt('Display Name:', userDisplayName());
    if (newName && newName.trim()) {
      const success = await updateDisplayName(newName.trim());
      if (success) {
        showToast('เปลี่ยนชื่อแล้ว');
      }
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div class="relative min-h-screen">
      {/* Nav */}
      <nav class="bg-white shadow p-4 mb-4 flex flex-col md:flex-row justify-between items-center no-print gap-4 md:gap-0">
        <div class="flex items-center gap-3">
          <img src="/crs-logo.svg" class="h-10 w-auto" alt="Logo" />
          <div class="font-bold text-xl text-blue-800 text-center md:text-left">
            {authState.provider?.org_name || 'Printing System'}
          </div>
        </div>
        <div class="flex flex-col md:flex-row gap-4 items-center w-full md:w-auto">
          <div class="flex items-center gap-2 justify-center md:justify-start">
            <span class="font-bold text-gray-700">{authState.profile?.display_name}</span>
            <span class="text-sm text-gray-500">({authState.profile?.role})</span>
            <button onClick={handleEditDisplayName} class="text-gray-400 hover:text-blue-600" title="เปลี่ยนชื่อ">
              ✏️
            </button>
          </div>
          <div class="hidden md:block h-6 w-px bg-gray-300 mx-2" />
          <button
            onClick={handleLogout}
            class="text-red-500 hover:text-red-700 w-full md:w-auto text-center border md:border-none p-2 md:p-0 rounded"
          >
            ออกจากระบบ
          </button>
        </div>
      </nav>

      {/* Content */}
      {props.children}
    </div>
  );
};

// Protected Route Wrapper
const ProtectedRoute: Component<{ component: Component }> = (props) => {
  return (
    <Show when={isAuthenticated()} fallback={<Navigate href="/login" />}>
      <Layout>
        <props.component />
      </Layout>
    </Show>
  );
};

// Public Route (Login only when not authenticated)
const PublicRoute: Component<{ component: Component }> = (props) => {
  return (
    <Show when={!isAuthenticated()} fallback={<Navigate href="/" />}>
      <props.component />
    </Show>
  );
};

const App: Component = () => {
  onMount(() => {
    initializeAuth();
  });

  return (
    <>
      {/* Global UI Components */}
      <Toast />
      <ConfirmModal />
      <DeviceLimitModal />

      {/* Router */}
      <Router>
        <Route path="/login" component={() => <PublicRoute component={Login} />} />
        <Route path="/" component={() => <ProtectedRoute component={Dashboard} />} />
        <Route path="/order" component={() => <ProtectedRoute component={Order} />} />
        <Route path="/history" component={() => <ProtectedRoute component={History} />} />
        <Route path="/history/:id" component={() => <ProtectedRoute component={JobDetail} />} />
        <Route path="/inventory" component={() => <ProtectedRoute component={Inventory} />} />
        <Route path="/inventory/logs" component={() => <ProtectedRoute component={InventoryLogs} />} />
        <Route path="/customers" component={() => <ProtectedRoute component={Customers} />} />
        <Route path="/services" component={() => <ProtectedRoute component={Services} />} />
        <Route path="*" component={() => <Navigate href="/" />} />
      </Router>
    </>
  );
};

export default App;
