import { Component, createSignal } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import { login } from '@/store/auth';
import { showToast } from '@/store/ui';
import { Button, Input } from '@/components';

const Login: Component = () => {
  const navigate = useNavigate();
  const [email, setEmail] = createSignal('');
  const [password, setPassword] = createSignal('');
  const [isLoading, setIsLoading] = createSignal(false);

  const handleSubmit = async (e: Event) => {
    e.preventDefault();

    if (!email() || !password()) {
      showToast('กรุณากรอกข้อมูลให้ครบ', 'error');
      return;
    }

    setIsLoading(true);

    const result = await login(email(), password());

    setIsLoading(false);

    if (result.success) {
      showToast('เข้าสู่ระบบสำเร็จ');
      navigate('/');
    } else if (result.requiresDeviceKick) {
      // DeviceLimitModal will be shown automatically
    } else if (result.error) {
      showToast(result.error, 'error');
    }
  };

  return (
    <div class="min-h-screen flex items-center justify-center bg-blue-900 p-4">
      <div class="bg-white p-6 md:p-8 rounded-lg shadow-2xl w-full max-w-sm">
        {/* Logo and Header */}
        <div class="flex flex-col items-center mb-8">
          <img 
            src="/crs-logo.svg" 
            alt="CRS Logo" 
            class="h-20 mb-4 object-contain"
            onError={(e) => {
              // Fallback: show text if logo doesn't load
              e.currentTarget.style.display = 'none';
            }}
          />
          <h1 class="text-xl font-bold text-blue-900 text-center mb-2">ระบบจัดการบริหารร้าน</h1>
          <h2 class="text-lg font-semibold text-blue-700 text-center">CRS Creative</h2>
        </div>

        <div class="border-b-2 border-blue-200 mb-6"></div>

        <h3 class="text-lg font-bold mb-6 text-center text-blue-800">เข้าสู่ระบบ</h3>

        <form onSubmit={handleSubmit} class="space-y-4">
          <Input
            type="email"
            placeholder="อีเมล"
            value={email()}
            onInput={(e) => setEmail(e.currentTarget.value)}
          />

          <Input
            type="password"
            placeholder="รหัสผ่าน"
            value={password()}
            onInput={(e) => setPassword(e.currentTarget.value)}
          />

          <Button type="submit" class="w-full" isLoading={isLoading()}>
            Login
          </Button>
        </form>
      </div>
    </div>
  );
};

export default Login;
