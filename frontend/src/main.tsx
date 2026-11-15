import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowDown, ArrowRight, Check, ChevronDown, ChevronLeft, ChevronRight, Coffee, Dog, ExternalLink, Heart, Info, Leaf, LoaderCircle, MapPin, PawPrint, RotateCcw, Search, ShieldCheck, SlidersHorizontal, X, Mountain, Route, BedDouble, ShoppingBag, Scissors } from 'lucide-react';
import { api, loadSaved, sourceLabel, photosFirst, photoCredit, photoPage, updatedDate, browseCategories, categoryLabels, categoryLabel, type Detail, type Place, type PlacesResponse, type Region } from './lib';
import './styles.css';
import AccountMenu from './AccountMenu';
import MemberProfileProvider from './MemberProfile';
import type { MemberUser } from './member-profile';
import type { DogProfile } from './dog-profiles';
import Community from './Community';
import PointShop from './PointShop';
import { isCommunityHash } from './community-api';
import TripPlanner from './TripPlanner';
import { coordinatesOf, loadTrip, MAX_STOPS, TRIP_STORAGE_KEY } from './trip';
import { locatePlace } from './geocoding';
import PlaceLocation from './PlaceLocation';
import PlaceImage from './PlaceImage';
import { usePagePhotos } from './usePagePhotos';
import AvatarStudio from './AvatarStudio';
import { communityApi } from './community-api';

const categoryIcons = { all: PawPrint, attraction: Mountain, stay: BedDouble, shopping: ShoppingBag, restaurant: Coffee, care: Scissors };
function CategoryIcon({ category }: { category: string }) {
  const Icon = categoryIcons[category as keyof typeof categoryIcons] || MapPin;
  return <Icon size={16}/>;
}
function App() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [memberUser, setMemberUser] = useState<MemberUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const onSessionChange = useCallback((value: boolean, user: MemberUser | null = null) => { setLoggedIn(value); setAuthReady(true); setMemberUser(current => current?.id === user?.id && current?.nickname === user?.nickname ? current : user); }, []);
  const [avatar, setAvatar] = useState(window.location.hash === '#avatar');
  useEffect(() => { const sync = () => setAvatar(window.location.hash === '#avatar'); window.addEventListener('hashchange', sync); return () => window.removeEventListener('hashchange', sync); }, []);
  const [shop, setShop] = useState(window.location.hash === '#shop');
  const showShop = shop && loggedIn;
  useEffect(() => {
    const redirectHome = () => {
      if (authReady && (!window.location.hash || window.location.hash === '#')) {
        window.location.replace(loggedIn ? '#shop' : '#explore');
      }
    };
    redirectHome(); window.addEventListener('hashchange', redirectHome);
    return () => window.removeEventListener('hashchange', redirectHome);
  }, [authReady, loggedIn]);
  useEffect(() => { if (shop && authReady && !loggedIn) { setShop(false); window.location.hash = 'explore'; } }, [shop, authReady, loggedIn]);
  useEffect(() => { const sync = () => setShop(window.location.hash === '#shop'); window.addEventListener('hashchange', sync); return () => window.removeEventListener('hashchange', sync); }, []);
  const [community, setCommunity] = useState(isCommunityHash(window.location.hash));
  const [dogs, setDogs] = useState<DogProfile[] | null>(null);
  useEffect(() => { const sync = () => setCommunity(isCommunityHash(window.location.hash)); window.addEventListener('hashchange', sync); return () => window.removeEventListener('hashchange', sync); }, []);
  const [shareRequest, setShareRequest] = useState(0);
  const [regions, setRegions] = useState<Region[]>([]);
  const [region, setRegion] = useState('50');
  const [district, setDistrict] = useState('');
  const [districts, setDistricts] = useState<Region[]>([]);
  const [category, setCategory] = useState('all');
  const [draft, setDraft] = useState('');
  const [keyword, setKeyword] = useState('');
  const [sort, setSort] = useState('photo');
  const [page, setPage] = useState(1);
  const [mode, setMode] = useState('');
  const [result, setResult] = useState<PlacesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [districtError, setDistrictError] = useState('');
  const [retry, setRetry] = useState(0);
  const [saved, setSaved] = useState<Place[]>(loadSaved);
  const [savedView, setSavedView] = useState(false);
  const [savedPage, setSavedPage] = useState(1);
  const [resultScope, setResultScope] = useState('');
  const searchScope = JSON.stringify([region, district, category, keyword, sort, page, retry]);
  const [tripStops, setTripStops] = useState<Place[]>(loadTrip);
  const [sharedStops, setSharedStops] = useState<Place[] | null>(null);
  const [sharedError, setSharedError] = useState('');
  useEffect(() => {
    let abort: AbortController | undefined;
    const load = () => {
      abort?.abort(); abort = new AbortController(); const signal = abort.signal;
      setSharedStops(null); setSharedError('');
      const match = /^#trip=([a-f0-9-]{36})$/.exec(window.location.hash);
      if (!match) return;
      communityApi<{ stops: Pick<Place, 'id' | 'name' | 'address' | 'category' | 'latitude' | 'longitude'>[] }>(`/shares/${match[1]}`, 'GET', undefined, signal)
        .then(data => { if (!signal.aborted) setSharedStops(data.stops.map(p => ({ ...p, image: '', phone: '', modified: '' }))); })
        .catch(e => { if (!signal.aborted) setSharedError((e as Error).message); });
    };
    load(); window.addEventListener('hashchange', load);
    return () => { abort?.abort(); window.removeEventListener('hashchange', load); };
  }, []);
  const [resolvingTrip, setResolvingTrip] = useState<string[]>([]);
  const pendingTrip = useRef(new Set<string>());
  const tripQueue = useRef<Promise<void>>(Promise.resolve());
  const tripGeneration = useRef(0);
  const tripStopsRef = useRef(tripStops);
  tripStopsRef.current = tripStops;
  const [selected, setSelected] = useState<Place | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const photoUpdates = useRef(new Map<string, Place>());
  const onPhoto = useCallback((photo: Place) => {
    photoUpdates.current.set(photo.id, photo);
    const apply = (p: Place) => p.id === photo.id && (!p.image || p.imageSource === 'kakao') ? { ...p, image: photo.image, imageSource: photo.imageSource, imagePage: photo.imagePage, imageCollectedAt: photo.imageCollectedAt } : p;
    setResult(current => current ? { ...current, items: current.items.map(apply) } : current);
    setSaved(current => current.some(p => p.id === photo.id && (!p.image || p.imageSource === 'kakao')) ? current.map(apply) : current);
    setDetail(current => current && current.place.id === photo.id && (!current.place.image || current.place.imageSource === 'kakao') ? { ...current, place: apply(current.place) } : current);
    setTripStops(current => current.some(p => p.id === photo.id && (!p.image || p.imageSource === 'kakao')) ? current.map(apply) : current);
  }, []);
  const [detailError, setDetailError] = useState('');
  const [guide, setGuide] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [toast, setToast] = useState('');
  const detailDialog = useRef<HTMLDialogElement>(null);
  const guideDialog = useRef<HTMLDialogElement>(null);
  const resultsRef = useRef<HTMLElement>(null);
  const tripRef = useRef<HTMLDivElement>(null);
  const browseRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([api<Region[]>('/regions', controller.signal), api<{mode: string}>('/status', controller.signal)])
      .then(([r, s]) => { setRegions(r); setMode(s.mode); })
      .catch(e => { if (e.name !== 'AbortError') setError('백엔드에 연결하지 못했습니다. Spring Boot 서버 실행 후 다시 시도해주세요.'); });
    return () => controller.abort();
  }, [retry]);
  useEffect(() => {
    const controller = new AbortController();
    setDistricts([]); setDistrictError('');
    api<Region[]>(`/districts?region=${region}`, controller.signal).then(setDistricts)
      .catch(e => { if (e.name !== 'AbortError') setDistrictError('세부 지역을 불러오지 못했습니다. 지역 전체로 검색할 수 있어요.'); });
    return () => controller.abort();
  }, [region, retry]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    const query = new URLSearchParams({ region, district, category, keyword, sort, page: String(page) });
    api<PlacesResponse>(`/places?${query}`, controller.signal).then(data => { if (!controller.signal.aborted) { setResult(data); setResultScope(searchScope); setMode(data.mode); } })
      .catch(e => { if (e.name !== 'AbortError') setError(e.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [region, district, category, keyword, sort, page, retry]);
  useEffect(() => {
    try { localStorage.setItem('daeng-places', JSON.stringify(saved)); }
    catch { setToast('브라우저 저장 공간이 부족해 즐겨찾기를 저장하지 못했어요.'); }
  }, [saved]);
  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(''), 3000); return () => clearTimeout(id); }, [toast]);
  useEffect(() => {
    if (!selected) { detailDialog.current?.close(); return; }
    detailDialog.current?.showModal(); setDetail(null); setDetailError('');
    const controller = new AbortController();
    api<Detail>(`/places/${encodeURIComponent(selected.id)}`, controller.signal).then(data => {
      const photo = photoUpdates.current.get(data.place.id);
      if (photo && !data.place.image) data = { ...data, place: { ...data.place, image: photo.image, imageSource: photo.imageSource, imagePage: photo.imagePage, imageCollectedAt: photo.imageCollectedAt } };
      setDetail(data);
      setSaved(current => current.some(p => p.id === data.place.id && p.image !== data.place.image)
        ? current.map(p => p.id === data.place.id ? data.place : p) : current);
    })
      .catch(e => { if (e.name !== 'AbortError') setDetailError(e.message); });
    return () => controller.abort();
  }, [selected, retry]);
  useEffect(() => { if (guide) guideDialog.current?.showModal(); else guideDialog.current?.close(); }, [guide]);
  const toggleSave = (p: Place) => {
    const exists = saved.some(s => s.id === p.id);
    setSaved(current => exists ? current.filter(s => s.id !== p.id) : [...current, p]);
    setToast(exists ? '저장한 장소에서 삭제했어요.' : '함께 가고 싶은 장소에 저장했어요.');
  };
  useEffect(() => {
    try { localStorage.setItem(TRIP_STORAGE_KEY, JSON.stringify(tripStops)); }
    catch { setToast('브라우저 저장 공간이 부족해 여행 코스를 저장하지 못했어요.'); }
  }, [tripStops]);
  const toggleTrip = async (place: Place): Promise<boolean> => {
    if (tripStopsRef.current.some(p => p.id === place.id)) { setTripStops(current => current.filter(p => p.id !== place.id)); return true; }
    if (place.id.startsWith('demo-') || pendingTrip.current.has(place.id)) return false;
    if (tripStopsRef.current.length + pendingTrip.current.size >= MAX_STOPS) { setToast(`코스에는 최대 ${MAX_STOPS}곳까지 담을 수 있어요.`); return false; }
    pendingTrip.current.add(place.id);
    setResolvingTrip([...pendingTrip.current]);
    const generation = tripGeneration.current;
    const previous = tripQueue.current;
    let release = () => {};
    tripQueue.current = new Promise<void>(resolve => { release = resolve; });
    try {
      await previous;
      if (generation !== tripGeneration.current) return false;
      const located = await locatePlace(place);
      if (generation !== tripGeneration.current) return false;
      if (tripStopsRef.current.length >= MAX_STOPS) { setToast(`코스에는 최대 ${MAX_STOPS}곳까지 담을 수 있어요.`); return false; }
      setTripStops(current => current.some(p => p.id === located.id) || current.length >= MAX_STOPS ? current : [...current, located]);
      setSaved(current => current.map(p => p.id === located.id ? { ...p, latitude: located.latitude, longitude: located.longitude } : p));
      setToast(`${place.name} · 코스에 담았어요.`);
      return true;
    } catch (e) {
      setToast(e instanceof Error ? e.message : '위치를 확인하지 못했어요. 잠시 후 다시 시도해주세요.');
      return false;
    } finally {
      release();
      pendingTrip.current.delete(place.id);
      setResolvingTrip([...pendingTrip.current]);
    }
  };
  const showTrip = () => tripRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const shareTrip = () => { if (!loggedIn) { setToast('로그인 후 공유할 수 있어요.'); return; } setShareRequest(n => n + 1); setCommunity(true); window.location.hash = 'community'; window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const importCourse = (stops: Place[]) => {
    tripGeneration.current++; tripStopsRef.current = stops; setTripStops(stops);
    setCommunity(false); window.location.hash = 'explore'; setToast('공유 코스를 내 여행 코스로 가져왔어요.'); requestAnimationFrame(showTrip);
  };
  const browseFromCommunity = () => { setCommunity(false); window.location.hash = 'explore'; requestAnimationFrame(browsePlaces); };
  const browsePlaces = () => browseRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const chooseRegion = (code: string) => { setRegion(code); setDistrict(''); setPage(1); setSavedView(false); };
  const reset = () => { setDistrict(''); setCategory('all'); setDraft(''); setKeyword(''); setSort('photo'); setPage(1); };
  const scrollResults = () => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const regionName = regions.find(r => r.code === region)?.name || '서울';
  const savedPages = Math.max(1, Math.ceil(saved.length / 9));
  const currentSavedPage = Math.min(savedPage, savedPages);
  const availablePlaces = savedView ? saved.slice((currentSavedPage - 1) * 9, currentSavedPage * 9) : result?.items || [];
  usePagePhotos(availablePlaces, savedView ? `saved-${currentSavedPage}` : searchScope,
    !community && !showShop && !avatar && (savedView || (!loading && !error && resultScope === searchScope)), onPhoto);
  const places = sort === 'photo' ? photosFirst(availablePlaces) : availablePlaces;
  const total = savedView ? saved.length : result?.total || 0;
  const pages = Math.ceil((result?.total || 0) / (result?.pageSize || 9));
  return <MemberProfileProvider key={memberUser?.id || 'guest'} user={memberUser}>
    {(sharedStops || sharedError) && <section className="container shared-trip-banner" aria-label="공유받은 여행 코스">
      {sharedError ? <p role="alert">{sharedError}</p> : sharedStops && <><strong>공유받은 여행 코스 · {sharedStops.length}곳</strong><p>{sharedStops.map(p => p.name).join(' → ')}</p><button className="primary-button" onClick={() => { tripGeneration.current++; setTripStops(sharedStops); setSharedStops(null); window.location.hash = ''; requestAnimationFrame(showTrip); }}>이 코스를 내 지도에서 보기</button></>}
    </section>}
    <header className="header"><div className="container header-inner">
      <a className="brand" href="#" onClick={() => { setCommunity(false); setSavedView(false); }} aria-label="댕댕여지도 홈"><span className="brand-icon"><PawPrint size={23} fill="currentColor"/></span>댕댕여지도<span className="brand-dot">.</span></a>
      <nav className="community-nav" aria-label="주 메뉴"><button className={!community && !showShop && !avatar && !savedView ? 'nav active' : 'nav'} onClick={() => { setCommunity(false); setSavedView(false); window.location.hash = 'explore'; requestAnimationFrame(scrollResults); }}>장소 둘러보기</button><button className={community ? 'nav active' : 'nav'} onClick={() => { setCommunity(true); window.location.hash = 'community'; window.scrollTo({ top: 0, behavior: 'smooth' }); }}>코스 공유</button>{loggedIn && <button className={showShop ? 'nav active' : 'nav'} onClick={() => { window.location.hash = 'shop'; window.scrollTo({ top: 0, behavior: 'smooth' }); }}>포인트 상점</button>}<button className={avatar ? 'nav active' : 'nav'} onClick={() => { setAvatar(true); setCommunity(false); setShop(false); window.location.hash = 'avatar'; window.scrollTo({ top: 0, behavior: 'smooth' }); }}>3D 아바타</button><button className="nav" onClick={() => setGuide(true)}>동반 가이드</button></nav>
      <div className="header-actions">
        <button className={`saved-button ${savedView && !community ? 'selected' : ''}`} onClick={() => { setCommunity(false); setSavedView(community || !savedView); window.location.hash = 'explore'; requestAnimationFrame(scrollResults); }}><Heart size={17}/> 저장한 장소 <span>{saved.length}</span></button>
        <AccountMenu dogs={dogs} onDogsChange={setDogs} onSessionChange={onSessionChange}/>
      </div>
    </div></header>
    {showShop && !avatar && <PointShop/>}
    {avatar && <AvatarStudio user={memberUser} dogs={dogs} authReady={authReady}/>}
    {community && !showShop && !avatar && <Community loggedIn={loggedIn} dogs={dogs} regions={regions} tripStops={tripStops} initialRegion={region} shareRequest={shareRequest} onShareHandled={() => setShareRequest(0)} onImportCourse={importCourse} onBrowse={browseFromCommunity}/>}
    <main hidden={community || showShop || avatar}>
      <section className="hero"><div className="container hero-inner">
        <div className="hero-copy"><div className="eyebrow"><span/> OUR LITTLE ADVENTURE</div><h1>좋은 곳엔,<br/>언제나 <span>함께 가개.</span></h1><p>초록빛 산책길부터, 하룻밤 쉬어갈 숙소까지.<br/>우리 아이와 함께할 다음 장소를 찾아보세요.</p><button className="hero-cta" onClick={scrollResults}>우리만의 여행 코스 만들기 <ArrowDown size={17}/></button><div className="hero-footnote"><ShieldCheck size={15}/> 한국관광공사 · 한국문화정보원 공공데이터 활용</div></div>
        <div className="hero-visual"><img src="/images/hero.jpg" alt="따뜻한 햇살을 받으며 쉬고 있는 반려견"/><div className="hero-image-shade"/><span className="image-caption">A little coffee. A little walk. A lot of love.</span><div className="hero-note"><span className="note-icon"><PawPrint size={22}/></span><div><small>오늘도 같이,</small><strong>발 닿는 곳 어디든</strong></div><Heart size={17} className="note-heart"/></div><span className="floating-paw"><PawPrint size={38}/></span></div>
      </div></section>
      <section className="container explore" ref={resultsRef} id="explore">
        <div ref={tripRef} className="trip-scroll-target"><TripPlanner loggedIn={loggedIn} onShare={shareTrip} stops={tripStops} onChange={next => { if (!next.length) tripGeneration.current++; setTripStops(next); }} onBrowse={browsePlaces}/></div>
        <div className="section-heading trip-browse-heading" ref={browseRef}><div><div className="eyebrow section-eyebrow">PLACES TOGETHER</div><h2>{savedView ? '다음엔 여기, 같이 가요' : '어디로 떠나볼까요?'}<PawPrint size={23}/></h2><p>{savedView ? '마음에 담아둔 우리만의 장소 모음이에요.' : '지역과 공간을 고르고, 마음에 드는 장소를 코스에 담아보세요.'}</p></div><button className="mobile-filter" onClick={() => setFiltersOpen(!filtersOpen)}><SlidersHorizontal size={18}/> 필터</button><span className="section-aside"><Leaf size={17}/> 함께하는 일상이 여행이 되도록</span></div>
        {mode === 'local' && <div className="demo-notice"><Info size={16}/><span><strong>동반 가능 장소 자료 조회 중</strong> · 문화시설 자료·동반가능 업소현황·추가 CSV를 함께 제공합니다. API 인증키를 설정하면 관광공사 자료도 함께 표시합니다.</span></div>}
        {result?.warning && <div className="demo-notice" role="status"><Info size={16}/><span>{result.warning} <button className="retry-link" onClick={() => setRetry(n => n + 1)}>다시 시도</button></span></div>}
        <div className={`explore-layout ${savedView ? 'saved-layout' : ''}`}>
          {!savedView && <aside className={`filters ${filtersOpen ? 'open' : ''}`}><div className="filter-title"><span><SlidersHorizontal size={17}/> 맞춤 탐색</span><button onClick={reset} aria-label="검색 필터 초기화"><RotateCcw size={15}/></button></div>
            <label className="field-label" htmlFor="region"><MapPin size={15}/> 어느 지역으로 갈까요?</label><div className="select-wrap"><select id="region" value={region} onChange={e => chooseRegion(e.target.value)}>{regions.length ? regions.map(r => <option key={r.code} value={r.code}>{r.name}</option>) : <option value="11">서울</option>}</select><ChevronDown size={15}/></div>
            <div className="select-wrap district-select"><select aria-label="시군구 선택" value={district} onChange={e => { setDistrict(e.target.value); setPage(1); }}><option value="">시 · 군 · 구 전체</option>{districts.map(d => <option key={d.code} value={d.code}>{d.name}</option>)}</select><ChevronDown size={15}/></div>{districtError && <p className="field-help">{districtError}</p>}
            <div className="filter-divider"/><span className="field-label"><Coffee size={15}/> 어떤 공간을 찾나요?</span><div className="category-options">{browseCategories.map(key => <button key={key} aria-pressed={category === key} className={category === key ? 'category-option chosen' : 'category-option'} onClick={() => { setCategory(key); setPage(1); }}><span><CategoryIcon category={key}/> {key === 'all' ? '모든 공간' : categoryLabels[key]}</span><span className="radio-mark">{category === key && <span/>}</span></button>)}</div>
            <div className="filter-divider"/><div className="guide-card"><span className="guide-icon"><Dog size={27}/></span><h3>처음 함께 가는 곳이라면?</h3><p>방문 전 동반 조건을 확인하면<br/>더 편안한 외출이 될 거예요.</p><button onClick={() => setGuide(true)}>동반 가이드 살펴보기 <ArrowRight size={14}/></button></div>
          </aside>}
          <div className="results"><form className="search-bar" onSubmit={e => { e.preventDefault(); setKeyword(draft.trim()); setPage(1); }}><Search size={19}/><input aria-label="장소 이름 또는 동네 검색" placeholder="어떤 곳을 찾고 있나요? 장소 이름을 검색해보세요" value={draft} maxLength={60} onChange={e => setDraft(e.target.value)} disabled={savedView}/>{draft && <button className="clear-search" type="button" aria-label="검색어 지우기" onClick={() => { setDraft(''); setKeyword(''); setPage(1); }}><X size={15}/></button>}<button className="search-submit" disabled={savedView}>검색</button></form>
            <div className="results-toolbar"><div><h3>{savedView ? '저장한 장소' : <><MapPin size={17}/>{regionName} {districts.find(d => d.code === district)?.name || '전체'}{category !== 'all' && <span className="current-category">{categoryLabel(category)}</span>}</>}</h3><span className="result-count">동반 장소 <b>{loading && !savedView ? '…' : total}</b>곳</span></div>{!savedView && <div className="sort-control"><select aria-label="장소 정렬" value={sort} onChange={e => { setSort(e.target.value); setPage(1); }}><option value="photo">사진 있는 장소 우선</option><option value="recent">최근 업데이트순</option><option value="name">이름순</option></select><ChevronDown size={13}/></div>}</div>
            {!savedView && keyword && <div className="active-keyword">“{keyword}” 검색 결과 <button onClick={() => { setKeyword(''); setDraft(''); setPage(1); }} aria-label="검색 해제"><X size={13}/></button></div>}
            {!savedView && loading ? <div className="place-grid" aria-label="지역 자료를 통합하고 있습니다. 첫 조회에는 잠시 시간이 걸릴 수 있습니다." aria-busy="true">{Array.from({length: 6}, (_, i) => <div key={i} className="skeleton"><div/><span/><span/></div>)}</div> : error && !savedView ? <div className="empty-state" role="alert"><Info size={32}/><h3>잠깐, 연결을 확인해주세요</h3><p>{error}</p><button onClick={() => setRetry(n => n + 1)}>다시 시도 <RotateCcw size={15}/></button></div> : !places.length ? <div className="empty-state"><PawPrint size={38}/><h3>{savedView ? '마음에 드는 장소를 담아보세요' : '아직 함께 갈 공간을 찾지 못했어요'}</h3><p>{savedView ? '장소 카드의 하트를 누르면 여기에 모아볼 수 있어요.' : '다른 지역이나 검색어로 다시 찾아보세요.'}</p><button onClick={() => { reset(); setSavedView(false); }}>장소 둘러보기 <ArrowRight size={15}/></button></div> : <div className="place-grid">{places.map(p => <article className="place-card" key={p.id}><div className="card-image"><button className="image-button" aria-label={`${p.name} 상세 보기`} onClick={() => setSelected(p)}><PlaceImage place={p}/></button><span className="pet-badge"><PawPrint size={11}/> {p.id.startsWith('demo-') ? '예시 장소' : '반려동물 동반'}</span><button className={`heart-button ${saved.some(s => s.id === p.id) ? 'is-saved' : ''}`} aria-label={`${p.name} ${saved.some(s => s.id === p.id) ? '저장 취소' : '저장'}`} aria-pressed={saved.some(s => s.id === p.id)} onClick={() => toggleSave(p)}><Heart size={18} fill={saved.some(s => s.id === p.id) ? 'currentColor' : 'none'}/></button></div><div className="card-content"><span className="card-category">{categoryLabel(p.category)}</span><span className="card-source">{sourceLabel(p)}{photoCredit(p) && <> · {photoPage(p) ? <a href={photoPage(p)} target="_blank" rel="noreferrer">{photoCredit(p)}</a> : photoCredit(p)}</>}</span><button className="card-title" onClick={() => setSelected(p)}>{p.name}<ChevronRight size={17}/></button><p className="card-address"><MapPin size={12}/>{p.address}</p><button className={`card-route-button ${tripStops.some(stop => stop.id === p.id) ? 'in-trip' : ''}`} onClick={() => toggleTrip(p)} aria-pressed={tripStops.some(stop => stop.id === p.id)} disabled={resolvingTrip.includes(p.id) || p.id.startsWith('demo-')} aria-busy={resolvingTrip.includes(p.id)}>{resolvingTrip.includes(p.id) ? <LoaderCircle className="spin" size={14}/> : tripStops.some(stop => stop.id === p.id) ? <Check size={14}/> : <Route size={14}/>} {resolvingTrip.includes(p.id) ? '위치 확인 중…' : tripStops.some(stop => stop.id === p.id) ? `코스 ${tripStops.findIndex(stop => stop.id === p.id) + 1}번째 · 선택 해제` : '코스에 담기'}</button><div className="card-bottom"><span><Dog size={14}/>{p.id.startsWith('demo-') ? '동반 정보 예시 제공' : '동반 조건 확인하기'}</span><button onClick={() => setSelected(p)} aria-label={`${p.name} 동반 조건 보기`}><ArrowRight size={15}/></button></div></div></article>)}</div>}
            {!savedView && !loading && !error && pages > 1 && <nav className="pagination" aria-label="검색 결과 페이지"><button disabled={page === 1} aria-label="이전 페이지" onClick={() => { setPage(page - 1); scrollResults(); }}><ChevronLeft size={16}/></button><span><b>{page}</b> / {pages}</span><button disabled={page === pages} aria-label="다음 페이지" onClick={() => { setPage(page + 1); scrollResults(); }}><ChevronRight size={16}/></button></nav>}
            {savedView && savedPages > 1 && <nav className="pagination" aria-label="저장한 장소 페이지"><button disabled={currentSavedPage === 1} aria-label="이전 페이지" onClick={() => { setSavedPage(currentSavedPage - 1); scrollResults(); }}><ChevronLeft size={16}/></button><span><b>{currentSavedPage}</b> / {savedPages}</span><button disabled={currentSavedPage === savedPages} aria-label="다음 페이지" onClick={() => { setSavedPage(currentSavedPage + 1); scrollResults(); }}><ChevronRight size={16}/></button></nav>}
            <div className="data-note"><ShieldCheck size={14}/><p>한국관광공사 API · 문화시설 자료 · 동반가능 업소현황 · 추가 CSV 통합 · 동반 조건은 자료 기준일 이후 바뀔 수 있으니 방문 전 시설에 확인해주세요.</p></div>
          </div>
        </div>
      </section>
      <section className="container together-banner"><div className="banner-icon"><PawPrint size={31}/></div><div><h3>작은 배려가, 더 많은 ‘함께’를 만들어요.</h3><p>목줄과 배변봉투를 챙기고, 우리 아이의 동반 조건을 미리 확인해주세요.</p></div><button onClick={() => setGuide(true)}>행복한 외출을 위한 약속 <ArrowRight size={17}/></button></section>
    </main>
    <footer className="container footer"><div><a href="#" className="brand footer-brand"><PawPrint size={20}/> 댕댕여지도.</a><p>함께라서 더 좋은, 우리들의 지도</p></div><div><a href="https://www.data.go.kr/data/15135102/openapi.do" target="_blank" rel="noreferrer">관광공사 API 출처 <ExternalLink size={12}/></a><span className="csv-footer-source">한국문화정보원 CSV · 동반가능 업소현황 XLSX · 추가 동반 자료 CSV</span><small>© {new Date().getFullYear()} 댕댕여지도. Made for little adventures.</small></div></footer>
    {!community && !showShop && !avatar && tripStops.length > 0 && <div className="trip-dock"><div><Route size={19}/><span>우리의 여행 코스 <strong>{tripStops.length}곳</strong></span></div><button onClick={showTrip}>지도에서 경로 보기 <ArrowRight size={16}/></button></div>}
    {toast && <div className="toast" role="status"><Check size={17}/>{toast}</div>}
    <dialog ref={detailDialog} onCancel={() => setSelected(null)} onClick={e => { if (e.target === e.currentTarget) setSelected(null); }} onClose={() => setSelected(null)} className="detail-dialog"><button className="dialog-close" onClick={() => setSelected(null)} aria-label="상세 닫기"><X size={20}/></button>{selected && <><PlaceImage key={selected.id} className="detail-image" place={detail?.place || selected}/><div className="detail-content"><span className="card-category">{categoryLabel(selected.category)}</span><h2>{selected.name}</h2><p className="source-attribution">{sourceLabel(detail?.place || selected)} · 자료 기준 {updatedDate(detail?.place || selected)}{photoCredit(detail?.place || selected) && <><br/>{photoPage(detail?.place || selected) ? <a href={photoPage(detail?.place || selected)} target="_blank" rel="noreferrer">{photoCredit(detail?.place || selected)} · 원문 보기 ↗</a> : photoCredit(detail?.place || selected)}</>}</p><p className="detail-address"><MapPin size={15}/>{selected.address}</p><PlaceLocation key={selected.id} place={detail?.place || selected}/>{detailError ? <div className="detail-error" role="alert"><p>{detailError}</p><button onClick={() => setRetry(n => n + 1)}>다시 시도</button></div> : !detail ? <p className="detail-loading"><LoaderCircle size={18} className="spin"/> 동반 정보를 확인하고 있어요</p> : <>{detail.mode === 'demo' && <p className="detail-demo">가상의 예시 장소입니다. 실제 방문 정보가 아닙니다.</p>}<p className="overview">{detail.overview || '장소 소개가 아직 제공되지 않았어요.'}</p><div className="detail-info">{[[selected.category === 'stay' && selected.source !== 'csv' ? '체크인' : '이용시간', detail.hours], ['휴무일', detail.restDay], ['주차', detail.parking], ['동반 가능 동물', detail.animals], ['동반 시 필요사항', detail.requirements], ['동반 시설', detail.facilities], ['기타 동반 정보', detail.other]].map(([label, value]) => <div key={label}><strong>{label}</strong><span>{value || '정보 미제공 · 방문 전 확인해주세요'}</span></div>)}</div></>}<button className="trip-detail-action" disabled={resolvingTrip.includes(selected.id) || selected.id.startsWith('demo-')} aria-busy={resolvingTrip.includes(selected.id)} onClick={async () => { if (tripStops.some(p => p.id === selected.id) || await toggleTrip(detail?.place || selected)) { setSelected(null); requestAnimationFrame(showTrip); } }}><Route size={17}/>{resolvingTrip.includes(selected.id) ? '위치 확인 중…' : tripStops.some(p => p.id === selected.id) ? '여행 코스에서 경로 보기' : '코스에 담고 경로 보기'}</button><div className="detail-actions"><button className="primary-button" onClick={() => toggleSave(detail?.place || selected)}><Heart size={17} fill={saved.some(s => s.id === selected.id) ? 'currentColor' : 'none'}/>{saved.some(s => s.id === selected.id) ? '저장한 장소' : '장소 저장'}</button></div>{selected.phone && <a className="phone-link" href={`tel:${selected.phone.replace(/[^0-9+]/g, '')}`}>시설 문의 · {selected.phone}</a>}<p className="detail-disclaimer">실내 입장·체중 제한 등 세부 조건은 시설에 꼭 확인해주세요.</p></div></>}</dialog>
    <dialog ref={guideDialog} onCancel={() => setGuide(false)} onClose={() => setGuide(false)} onClick={e => { if (e.target === e.currentTarget) setGuide(false); }} className="guide-dialog"><button className="dialog-close" onClick={() => setGuide(false)} aria-label="가이드 닫기"><X size={20}/></button><div className="guide-dialog-icon"><PawPrint size={31}/></div><div className="eyebrow">HAPPY TOGETHER</div><h2>우리의 외출이<br/>모두에게 좋은 기억이 되도록.</h2><p>출발 전에, 이 네 가지만 함께 확인해요.</p><ol>{[['방문 전 한 번 더 확인해요', '동반 가능 구역, 반려견 크기·마릿수 제한과 이동 가방 필요 여부를 시설에 문의해주세요.'], ['목줄과 배변봉투를 챙겨요', '공용 공간에서는 목줄을 착용하고, 배변은 보호자가 바로 정리해주세요.'], ['아이의 컨디션을 먼저 살펴요', '낯선 공간이 불편하지 않도록 물과 익숙한 담요를 챙기고, 충분히 쉬어주세요.'], ['다른 손님도 함께 배려해요', '시설의 안내를 따르고, 다른 반려견과 인사할 때는 보호자의 동의를 먼저 구해주세요.']].map(([title, text], i) => <li key={title}><span>{String(i + 1).padStart(2, '0')}</span><div><h3>{title}</h3><p>{text}</p></div></li>)}</ol><button className="primary-button" onClick={() => setGuide(false)}>준비됐어요, 함께 가개 <PawPrint size={17}/></button></dialog>
  </MemberProfileProvider>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
