import { createSignal, createEffect, createMemo } from 'solid-js';
import { createStore } from 'solid-js/store';
import { supabase } from '@/lib/supabase';
import type { Profile, UserSession, ProviderInfo, Customer, Service } from '@/lib/types';
import { CONFIG, ROLE_PERMISSIONS } from '@/lib/types';
import { getDeviceId, getDeviceName } from '@/lib/utils';
import type { Session, User } from '@supabase/supabase-js';

// ============ Auth Store State ============
interface AuthState {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  provider: ProviderInfo | null;
  customers: Customer[];
  services: Service[];
  deviceSessions: UserSession[];
  isLoading: boolean;
  isInitialized: boolean;
}

const [authState, setAuthState] = createStore<AuthState>({
  session: null,
  user: null,
  profile: null,
  provider: null,
  customers: [],
  services: [],
  deviceSessions: [],
  isLoading: false,
  isInitialized: false,
});

// Device ID
const currentDeviceId = getDeviceId();

// ============ Computed Values ============
export const isAuthenticated = () => !!authState.session;
export const isAdmin = () => authState.profile?.role === 'admin';
export const canManageStock = () => ['admin', 'user'].includes(authState.profile?.role || '');
export const userDisplayName = () => authState.profile?.display_name || authState.user?.email || '';

export const can = (action: string): boolean => {
  const currentRole = authState.profile?.role || 'viewer';
  if (currentRole === 'admin') return true;
  const allowedActions = ROLE_PERMISSIONS[currentRole] || [];
  return allowedActions.includes(action);
};

// ============ Auth Actions ============

export const initializeAuth = async (): Promise<void> => {
  try {
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      setAuthState({ session: data.session, user: data.session.user });
      await fetchUserProfile();
      await checkSessionValidity();
      await loadInitialData();
    }
  } catch (error) {
    console.error('Error initializing auth:', error);
  } finally {
    setAuthState({ isInitialized: true });
  }
};

export const login = async (email: string, password: string): Promise<{ success: boolean; requiresDeviceKick?: boolean; error?: string }> => {
  setAuthState({ isLoading: true });

  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;

    const userId = data.session.user.id;
    
    // Check active device sessions
    const { data: sessions, error: sessError } = await supabase
      .from('user_sessions')
      .select('*')
      .eq('user_id', userId);

    if (sessError) throw sessError;

    // Check if this device already has a session
    const existingSession = sessions?.find((s: UserSession) => s.device_id === currentDeviceId);

    if (existingSession) {
      // Update last active time
      await supabase.from('user_sessions').update({ last_active: new Date().toISOString() }).eq('id', existingSession.id);
      await finalizeLogin(data.session);
      return { success: true };
    }

    // New device
    if ((sessions?.length || 0) >= CONFIG.MAX_DEVICES) {
      // Over device limit - need to kick another device
      setAuthState({ 
        session: data.session, 
        user: data.session.user,
        deviceSessions: sessions || []
      });
      await fetchUserProfile();
      return { success: false, requiresDeviceKick: true };
    }

    // Under limit - register new session
    await registerDeviceSession(userId);
    await finalizeLogin(data.session);
    return { success: true };

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    await supabase.auth.signOut();
    return { success: false, error: errorMessage };
  } finally {
    setAuthState({ isLoading: false });
  }
};

export const logout = async (): Promise<void> => {
  if (authState.session) {
    await supabase.from('user_sessions')
      .delete()
      .eq('user_id', authState.session.user.id)
      .eq('device_id', currentDeviceId);
  }
  await supabase.auth.signOut();
  setAuthState({
    session: null,
    user: null,
    profile: null,
    deviceSessions: [],
  });
};

export const kickDevice = async (sessionId: string): Promise<boolean> => {
  setAuthState({ isLoading: true });
  try {
    await supabase.from('user_sessions').delete().eq('id', sessionId);
    await registerDeviceSession(authState.session!.user.id);
    await finalizeLogin(authState.session!);
    return true;
  } catch (error) {
    console.error('Error kicking device:', error);
    return false;
  } finally {
    setAuthState({ isLoading: false });
  }
};

export const cancelDeviceKick = async (): Promise<void> => {
  setAuthState({ deviceSessions: [] });
  await logout();
};

// ============ Helper Functions ============

const registerDeviceSession = async (userId: string): Promise<void> => {
  await supabase.from('user_sessions').insert({
    user_id: userId,
    device_id: currentDeviceId,
    device_name: getDeviceName(),
  });
};

const finalizeLogin = async (session: Session): Promise<void> => {
  setAuthState({ session, user: session.user, deviceSessions: [] });
  await fetchUserProfile();
  await loadInitialData();
};

const fetchUserProfile = async (): Promise<void> => {
  if (!authState.session) return;

  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', authState.session.user.id)
    .single();

  if (data) {
    setAuthState({
      profile: {
        id: authState.session.user.id,
        email: authState.session.user.email || '',
        role: data.role || 'user',
        display_name: data.display_name || authState.session.user.email || '',
      },
    });
  }
};

const checkSessionValidity = async (): Promise<boolean> => {
  if (!authState.session) return false;

  const { data } = await supabase
    .from('user_sessions')
    .select('id')
    .eq('user_id', authState.session.user.id)
    .eq('device_id', currentDeviceId)
    .single();

  if (!data) {
    await logout();
    return false;
  }
  return true;
};

const loadInitialData = async (): Promise<void> => {
  const [providerResult, servicesResult, customersResult] = await Promise.all([
    supabase.from('provider_info').select('*').single(),
    supabase.from('services').select('*').order('service_name'),
    supabase.from('customers').select('*').order('name'),
  ]);

  setAuthState({
    provider: providerResult.data,
    services: servicesResult.data || [],
    customers: customersResult.data || [],
  });
};

export const updateDisplayName = async (newName: string): Promise<boolean> => {
  if (!authState.profile) return false;

  const { error } = await supabase
    .from('profiles')
    .update({ display_name: newName })
    .eq('id', authState.profile.id);

  if (!error) {
    setAuthState('profile', 'display_name', newName);
    return true;
  }
  return false;
};

// ============ Service Actions ============

export const addService = async (name: string, price: number): Promise<boolean> => {
  const { error } = await supabase.from('services').insert({
    service_name: name,
    unit_price: price,
  });

  if (!error) {
    await loadInitialData();
    return true;
  }
  return false;
};

export const updateServicePrice = async (id: string, price: number): Promise<boolean> => {
  const { error } = await supabase.from('services').update({ unit_price: price }).eq('id', id);
  if (!error) {
    await loadInitialData();
    return true;
  }
  return false;
};

export const deleteService = async (id: string): Promise<boolean> => {
  const { error } = await supabase.from('services').delete().eq('id', id);
  if (!error) {
    await loadInitialData();
    return true;
  }
  return false;
};

// ============ Customer Actions ============

export const saveCustomer = async (customer: Partial<Customer>): Promise<boolean> => {
  if (customer.id) {
    const { error } = await supabase.from('customers').update(customer).eq('id', customer.id);
    if (!error) {
      await loadInitialData();
      return true;
    }
  } else {
    const { error } = await supabase.from('customers').insert(customer);
    if (!error) {
      await loadInitialData();
      return true;
    }
  }
  return false;
};

export const deleteCustomer = async (id: string): Promise<boolean> => {
  const { error } = await supabase.from('customers').delete().eq('id', id);
  if (!error) {
    await loadInitialData();
    return true;
  }
  return false;
};

// Export state for components
export const useAuth = () => ({
  state: authState,
  isAuthenticated,
  isAdmin,
  canManageStock,
  userDisplayName,
  can,
  login,
  logout,
  kickDevice,
  cancelDeviceKick,
  initializeAuth,
  updateDisplayName,
  addService,
  updateServicePrice,
  deleteService,
  saveCustomer,
  deleteCustomer,
});

export { authState };
