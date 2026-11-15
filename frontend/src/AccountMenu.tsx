import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { UserRound, X } from 'lucide-react';
import kakaoLoginButton from './kakao-login.svg';
import DogProfiles, { DogProfileForm } from './DogProfiles';
import { accountApi, AccountRequestError, type DogProfile, type DogInput } from './dog-profiles';
import './account.css';
import { useMemberProfile } from './MemberProfile';
import type { MemberUser } from './member-profile';

type Session = {
  enabled: boolean;
  loginOrigin: string;
  user: { id: string; nickname: string } | null;
  dogSetupPending: boolean;
};

const callbackErrors: Record<string, string> = {
  cancelled: '카카오 로그인을 취소했어요.',
  expired: '로그인 요청이 만료됐어요. 카카오 로그인 버튼을 다시 눌러주세요.',
  failed: '카카오 로그인에 실패했어요. 잠시 후 다시 시도해주세요.',
  misconfigured: '카카오 로그인 설정을 확인해야 해요 (KOE010). 서비스 관리자에게 알려주세요.',
  unavailable: '아직 카카오 로그인 설정이 완료되지 않았어요.',
};

export default function AccountMenu({ dogs, onDogsChange, onSessionChange }: {
  onSessionChange: (loggedIn: boolean, user?: MemberUser | null) => void;
  dogs: DogProfile[] | null;
  onDogsChange: Dispatch<SetStateAction<DogProfile[] | null>>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const { profile, openProfile } = useMemberProfile();
  const [session, setSession] = useState<Session | null>(null);
  const [sessionError, setSessionError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [retry, setRetry] = useState(0);
  const [signingOut, setSigningOut] = useState(false);
  const [skippingSetup, setSkippingSetup] = useState(false);
  const [hideSetup, setHideSetup] = useState(false);
  const [dogsError, setDogsError] = useState('');
  const [hash, setHash] = useState(window.location.hash);
  const dogPage = hash === '#dogs' || hash === '#community/dogs';
  const showDogSetup = Boolean(session?.user && session.dogSetupPending && dogPage);

  useEffect(() => {
    const sync = () => setHash(window.location.hash);
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);

  useEffect(() => {
    if ((dogPage || showDogSetup) && !dialog.current?.open) dialog.current?.showModal();
  }, [dogPage, showDogSetup]);

  function closeAccount() {
    dialog.current?.close();
    const current = window.location.hash;
    if (current === '#community/dogs') window.location.hash = 'community';
    if (current === '#dogs' || current.startsWith('#dog/')) window.location.hash = 'explore';
  }

  useEffect(() => {
    const url = new URL(window.location.href);
    const result = url.searchParams.get('login');
    if (!result || !Object.hasOwn(callbackErrors, result)) return;
    setFeedback(callbackErrors[result]);
    url.searchParams.delete('login');
    window.history.replaceState(window.history.state, '', url);
    if (!dialog.current?.open) dialog.current?.showModal();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setSessionError('');
    accountApi<Session>('/session', 'GET', undefined, controller.signal)
      .then(data => {
        if (!controller.signal.aborted) {
          setSession(data);
          onSessionChange(!!data.user, data.user);
          if (!data.user) onDogsChange(null);
          if (data.dogSetupPending) setFeedback('');
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) { setSession(null); onSessionChange(false); setSessionError('로그인 정보를 불러오지 못했어요.'); }
      });
    return () => controller.abort();
  }, [retry, onSessionChange]);
  useEffect(() => {
    const refresh = () => setRetry(value => value + 1);
    const expired = () => { setSession(current => current && { ...current, user: null }); onSessionChange(false); refresh(); };
    const visible = () => { if (document.visibilityState === 'visible') refresh(); };
    const timer = setInterval(refresh, 30000);
    window.addEventListener('focus', refresh); window.addEventListener('auth-session-expired', expired);
    document.addEventListener('visibilitychange', visible);
    return () => { clearInterval(timer); window.removeEventListener('focus', refresh); window.removeEventListener('auth-session-expired', expired); document.removeEventListener('visibilitychange', visible); };
  }, [onSessionChange]);

  useEffect(() => {
    if (!session?.user || showDogSetup) return;
    const abort = new AbortController();
    setDogsError('');
    accountApi<DogProfile[]>('/dogs', 'GET', undefined, abort.signal)
      .then(data => { if (!abort.signal.aborted) onDogsChange(data); })
      .catch(error => {
        if (abort.signal.aborted) return;
        if (error instanceof AccountRequestError && error.status === 401) {
          onDogsChange(null);
          onSessionChange(false);
          setSession(current => current && { ...current, user: null });
        } else setDogsError(error.message);
      });
    return () => abort.abort();
  }, [session?.user, showDogSetup, retry, onDogsChange]);

  function handleSessionExpiry(error: unknown) {
    if (error instanceof AccountRequestError && error.status === 401) {
      onDogsChange(null);
      onSessionChange(false);
      setSession(current => current && { ...current, user: null, dogSetupPending: false });
      setFeedback('로그인 세션이 만료됐어요. 다시 로그인해주세요.');
      return true;
    }
    return false;
  }

  async function saveDog(id: string, input: DogInput, hideReminder = false) {
    try {
      const path = id ? `/dogs/${id}` : hideReminder ? '/dogs?hideSetup=true' : '/dogs';
      const dog = await accountApi<DogProfile>(path, id ? 'PUT' : 'POST', input);
      onDogsChange(current => {
        if (current === null) return null;
        return id ? current.map(item => item.id === id ? dog : item) : [...current, dog];
      });
    } catch (error) {
      handleSessionExpiry(error);
      throw error;
    }
  }

  async function deleteDog(id: string) {
    try {
      await accountApi<void>(`/dogs/${id}`, 'DELETE');
      onDogsChange(current => current?.filter(dog => dog.id !== id) ?? null);
    } catch (error) { handleSessionExpiry(error); throw error; }
  }

  function finishSetup() {
    setHideSetup(false);
    setSession(current => current && { ...current, dogSetupPending: false });
    closeAccount();
  }

  async function skipSetup() {
    setSkippingSetup(true);
    setFeedback('');
    try {
      await accountApi(hideSetup ? '/dogs/skip-setup?hideSetup=true' : '/dogs/skip-setup', 'POST');
      finishSetup();
    } catch (error) {
      if (!handleSessionExpiry(error)) setFeedback('건너뛰지 못했어요. 다시 시도해주세요.');
    } finally {
      setSkippingSetup(false);
    }
  }

  async function logout() {
    setFeedback('');
    setSigningOut(true);
    try {
      await accountApi('/logout', 'POST');
      onDogsChange(null);
      onSessionChange(false);
      setSession(current => current && { ...current, user: null, dogSetupPending: false });
      closeAccount();
    } catch {
      setFeedback('로그아웃하지 못했어요. 다시 시도해주세요.');
    } finally {
      setSigningOut(false);
    }
  }

  function showAccount() {
    setFeedback('');
    if (!dialog.current?.open) dialog.current?.showModal();
  }

  const section = !hash || hash === '#' || hash === '#explore' ? 'shop' : hash.slice(1);
  const loginPath = `/api/auth/kakao?section=${encodeURIComponent(section)}`;
  const user = session?.user;

  return <>
    <button type="button" className="account-trigger" onClick={showAccount} aria-haspopup="dialog">
      <UserRound size={17} aria-hidden="true" />
      <span>{profile?.nickname || user?.nickname || '로그인'}</span>
    </button>
    <dialog ref={dialog} className="account-dialog" aria-labelledby="account-title" onCancel={event => { event.preventDefault(); if (!showDogSetup) closeAccount(); }}>
      {!showDogSetup && <button type="button" className="dialog-close" aria-label="닫기" onClick={closeAccount}>
        <X size={20} />
      </button>}
      <h2 id="account-title">{showDogSetup ? '반려견 등록' : user ? '내 계정' : '로그인 · 회원가입'}</h2>
      {feedback && <p className="account-feedback" role="alert">{feedback}</p>}
      {showDogSetup ? <>
        <p>반려견을 등록하면 맞춤 코스를 볼 수 있어요. 나중에 내 계정에서 등록해도 돼요.</p>
        <DogProfileForm cancelLabel="건너뛰기" skipping={skippingSetup} onCancel={() => void skipSetup()}
          reminder={{ hidden: hideSetup, onChange: setHideSetup }}
          onSave={async input => { await saveDog('', input, hideSetup); finishSetup(); }}/>
      </> : user ? <>
        <p>{profile?.nickname || user.nickname}님, 카카오 계정으로 로그인했어요.</p>
        <button type="button" className="primary-button" onClick={() => { closeAccount(); openProfile(); }}>프로필 설정</button>
        {!dogPage && <a className="course-outline" href="#dogs">반려견 맞춤 조건 관리</a>}
        {dogPage && (dogs ? <DogProfiles dogs={dogs} onSave={saveDog} onDelete={deleteDog}/> : dogsError ? <>
          <p role="alert">{dogsError}</p>
          <button type="button" className="course-outline" onClick={() => setRetry(value => value + 1)}>다시 시도</button>
        </> : <p role="status">반려견 프로필을 불러오고 있어요…</p>)}
        <button type="button" className="secondary-button" disabled={signingOut} onClick={logout}>
          {signingOut ? '로그아웃 중…' : '로그아웃'}
        </button>
      </> : sessionError ? <>
        <p role="alert">{sessionError}</p>
        <button type="button" className="secondary-button" onClick={() => setRetry(value => value + 1)}>다시 시도</button>
      </> : !session ? <p role="status">로그인 정보를 확인하고 있어요…</p> : session.enabled ? <>
        <p>처음 이용하시면 카카오 인증 후 회원가입이 완료돼요.</p>
        <a className="kakao-login-link" href={`${session.loginOrigin}${loginPath}`}>
          <img src={kakaoLoginButton} alt="카카오 로그인" width="224" height="46" />
        </a>
      </> : !feedback && <p role="status">{callbackErrors.unavailable}</p>}
    </dialog>
  </>;
}
