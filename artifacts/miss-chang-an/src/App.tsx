import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, ArrowUpRight, CalendarDays, Facebook, Instagram, Menu as MenuIcon, Search, X } from 'lucide-react';
import { Link, Route, Switch, useLocation } from 'wouter';
import type { Category } from './types/menu';
import menuData from './data/menu.json';
import OrderPage from './OrderPage';
import QuickOrder from './QuickOrder';
import ChatWidget from './ChatWidget';
import { RouteAccessibility } from './components/route-accessibility';
import { useStatus } from './lib/hours';
import { useReveal } from './lib/reveal';
import { useLiveMenu } from './lib/menuState';
import './motion.css';

const MAP_URL = 'https://www.google.com/maps/search/?api=1&query=Miss+Chang+An+5071+Rochester+Rd+Troy+MI+48085';
const INSTAGRAM_URL = 'https://instagram.com/misschangan.troy';
const FACEBOOK_URL = 'https://facebook.com/profile.php?id=61565498745253';
const REVIEWS = { rating: '4.7', url: 'https://www.google.com/maps/search/?api=1&query=Miss+Chang+An+5071+Rochester+Rd+Troy+MI+48085' };
const quotes = [
  {
    text: 'The chili oil noodles were garlicky and savory. The Liang Pi was SO good.',
    author: 'Elizabeth X.',
    source: 'Yelp',
    url: 'https://www.yelp.com/biz/miss-chang-an-troy-3',
  },
  {
    text: 'The pulled pork & cumin lamb I ordered to try are delish. The bread are crunchy but so much oil is collecting at the bottom of the container. I had delish Taro ube latte. The boba needs to be boiled a little longer. The center of the boba pearls are still very hard.',
    author: 'Gloria',
    source: 'Seamless',
    url: 'https://www.seamless.com/menu/miss-chang-an--5071-rochester-road-troy/14603232',
  },
];
const videoStories = [
  { file: 'video-01.mp4', poster: 'testimonial-01.jpg', title: 'Menu highlights' },
  { file: 'video-02.mp4', poster: 'testimonial-02.jpg', title: 'Lamb paomo soup' },
  { file: 'video-03.mp4', poster: 'testimonial-03.jpg', title: 'A guest enjoys the noodles' },
  { file: 'video-04.mp4', poster: 'testimonial-04.jpg', title: 'Inside the restaurant' },
];
const PHONE = 'tel:+13138257757';
const ADDRESS = '5071 Rochester Rd, Troy, MI 48085';

const categories: Category[] = menuData.categories as Category[];

const featured = [
  { name: 'Chili oil noodles', chinese: '油泼面', image: 'chili-oil-noodles.webp', description: 'Wide hand-made noodles, chili flakes and garlic, with hot oil poured over at the pass. The most ordered dish in the house.', price: 'From $10.99' },
  { name: 'Cumin lamb roujiamo', chinese: '孜然羊肉肉夹馍', image: 'cumin-lamb-roujiamo.webp', description: 'Wok-fried lamb with cumin, packed into your choice of bun. The house favourite.', price: 'From $9.99' },
  { name: 'Lamb bread soup', chinese: '羊肉泡馍', image: 'lamb-bread-soup.webp', description: 'Rich lamb broth with lamb, torn flatbread, sweet potato noodle, tofu skin, wood ear and lily flower.', price: 'From $14.99' },
  { name: 'Soup dumplings', chinese: '灌汤小笼包', image: 'soup-dumplings.webp', description: 'Six hand-made pork soup dumplings, cooked when you order. Allow 10 to 15 minutes.', price: '$10.99' },
];

const thumbs: Record<string, string> = {
  'Chili oil-splashed noodles': 'chili-oil-noodles.webp',
  'Cumin lamb roujiamo': 'cumin-lamb-roujiamo.webp',
  "Xi'an lamb bread soup": 'lamb-bread-soup.webp',
  'Soup dumplings, 6': 'soup-dumplings.webp',
};

const legalContent = {
  privacy: [
    ['What this site collects', 'Pickup details entered into the ordering preview stay on your device and are not sent to the restaurant. This website does not take payments or use advertising or tracking cookies. Our hosting provider keeps standard server logs, such as your IP address and browser type, to keep the site running and secure.'],
    ['Fonts', 'Typefaces on this site load from Google Fonts, which receives your IP address when the page loads.'],
    ['Ordering', 'The pickup flow lets you try choosing dishes and reviewing an order. It does not submit an order or contact the kitchen. Your pickup name, phone number and notes are not saved permanently.'],
    ['Links', "Links to maps, delivery apps and social media take you to other companies' sites with their own privacy policies."],
    ['Your choices', 'To ask what we hold about you from an order, or to have it removed, call us on (313) 825-7757.'],
  ],
  terms: [
    ['This website', 'This site is run by Miss Chang An, 5071 Rochester Rd, Troy, MI 48085. It tells you what we cook, when we are open and how to order. By using it you agree to these terms.'],
    ['Menu and prices', 'We keep the menu and prices here up to date, but dishes and prices can change without notice. The price charged in the shop or on our ordering page on the day is the price that applies.'],
    ['Online ordering', 'The in-house ordering flow is an interactive preview. It does not place a real order, take payment or reserve a pickup time. Starting prices are shown without extra options or charges. To place a real order, call (313) 825-7757.'],
    ['Allergies', 'Our kitchen uses wheat, soy, sesame, peanuts, egg and shellfish. We cannot promise any dish is free of these. Tell us about allergies before you order.'],
    ['Content', 'Photographs, text and the Miss Chang An name on this site belong to us. Please ask before reusing them.'],
    ['Contact', 'Questions about these terms: call (313) 825-7757 or visit us at 5071 Rochester Rd, Troy, MI 48085.'],
  ],
};

function PageMeta({ title, description }: { title: string; description: string }) {
  useLayoutEffect(() => {
    const socialDescription = `Built by Studio 1801. ${description}`;
    document.title = title;
    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'description';
      document.head.appendChild(meta);
    }
    meta.content = description;
    for (const [selector, attribute, value] of [
      ['meta[property="og:title"]', 'content', title],
      ['meta[property="og:description"]', 'content', socialDescription],
      ['meta[name="twitter:title"]', 'content', title],
      ['meta[name="twitter:description"]', 'content', socialDescription],
    ]) {
      const tag = document.querySelector<HTMLMetaElement>(selector);
      if (tag) tag.setAttribute(attribute, value);
    }
  }, [title, description]);
  return null;
}

function OpenBadge({ tone = 'light' }: { tone?: 'light' | 'dark' }) {
  const status = useStatus();
  return <p className={`open-badge ${tone} ${status.open ? 'is-open' : 'is-closed'}`} role="status"><span className="open-dot" aria-hidden="true" /><strong>{status.label}</strong><span>{status.detail}</span></p>;
}

function Header() {
  const [open, setOpen] = useState(false);
  const [location] = useLocation();
  const headerRef = useRef<HTMLElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  useEffect(() => setOpen(false), [location]);
  useEffect(() => {
    if (location !== '/' || window.location.hash !== '#order-here') return;
    requestAnimationFrame(() => document.getElementById('order-here')?.scrollIntoView({ behavior: 'smooth' }));
  }, [location]);
  useEffect(() => {
    if (!open) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setOpen(false);
      toggleRef.current?.focus({ preventScroll: true });
    }
    function closeOutside(event: PointerEvent) {
      if (event.target instanceof Node && !headerRef.current?.contains(event.target)) setOpen(false);
    }
    function closeOnResize() {
      if (window.matchMedia('(min-width: 701px)').matches) setOpen(false);
    }
    document.addEventListener('keydown', closeOnEscape);
    document.addEventListener('pointerdown', closeOutside);
    window.addEventListener('resize', closeOnResize);
    return () => {
      document.removeEventListener('keydown', closeOnEscape);
      document.removeEventListener('pointerdown', closeOutside);
      window.removeEventListener('resize', closeOnResize);
    };
  }, [open]);
  return <header className={`site-header ${scrolled ? 'scrolled' : ''}`} ref={headerRef}>
    <div className="wrap header-inner">
      <Link href="/" className="brand" data-testid="link-home-brand" aria-label="Miss Chang An home"><span className="brand-cn zh" aria-hidden="true">念长安</span><span className="brand-en">Miss Chang An</span><span className="brand-tag">Xi'an street kitchen</span></Link>
      <button ref={toggleRef} className="mobile-toggle" type="button" aria-label={open ? 'Close navigation' : 'Open navigation'} aria-expanded={open} aria-controls="site-navigation" onClick={() => setOpen(value => !value)} data-testid="button-mobile-menu">{open ? <X size={22} /> : <MenuIcon size={22} />}</button>
      <nav id="site-navigation" className={`header-nav ${open ? 'open' : ''}`} aria-label="Main navigation">
        <div className="header-links">
          <Link href="/" className={`nav-link ${location === '/' ? 'active' : ''}`} aria-current={location === '/' ? 'page' : undefined} data-testid="link-header-home">Home</Link>
          <Link href="/#about" className="nav-link" data-testid="link-header-about" onClick={() => { setOpen(false); if (location === '/') document.getElementById('about')?.scrollIntoView(); }}>About Us</Link>
          <Link href="/menu" className={`nav-link ${location === '/menu' ? 'active' : ''}`} aria-current={location === '/menu' ? 'page' : undefined} data-testid="link-header-menu">Our Dishes</Link>
          <Link href="/#order-here" className="nav-link" data-testid="link-header-order" onClick={() => { setOpen(false); if (location === '/') document.getElementById('order-here')?.scrollIntoView(); }}>Build an order</Link>
          <Link href="/#reservations" className="nav-link nav-link-reservations" data-testid="link-header-reservations" onClick={() => { setOpen(false); if (location === '/') document.getElementById('reservations')?.scrollIntoView(); }}>Reservations</Link>
          <Link href="/#visit" className="nav-link" data-testid="link-header-visit" onClick={() => { setOpen(false); if (location === '/') document.getElementById('visit')?.scrollIntoView(); }}>Contact</Link>
        </div>
        <div className="header-actions"><Link href="/#order-here" onClick={event => { if (location === '/') { event.preventDefault(); document.getElementById('order-here')?.scrollIntoView({ behavior: 'smooth' }); } }} className="button button-red header-cta" data-testid="link-header-cta">Order pickup <ArrowRight size={18} aria-hidden="true" /></Link>
        <div className="header-social"><a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer" aria-label="Miss Chang An on Instagram" data-testid="link-header-instagram"><Instagram size={22} aria-hidden="true" /></a><a href={FACEBOOK_URL} target="_blank" rel="noopener noreferrer" aria-label="Miss Chang An on Facebook" data-testid="link-header-facebook"><Facebook size={22} aria-hidden="true" /></a></div></div>
      </nav>
    </div>
  </header>;
}

function Footer() {
  return <footer className="site-footer">
    <div className="wrap">
      <div className="footer-main">
        <div><p className="footer-name">Miss Chang An</p><div className="footer-info">{ADDRESS}<br /><a href={PHONE} data-testid="link-footer-phone">(313) 825-7757</a><br />Formerly Nook Tea &amp; Cafe</div><div className="footer-social"><a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer" aria-label="Instagram" data-testid="link-footer-instagram"><Instagram size={22} aria-hidden="true" /></a><a href={FACEBOOK_URL} target="_blank" rel="noopener noreferrer" aria-label="Facebook" data-testid="link-footer-facebook"><Facebook size={22} aria-hidden="true" /></a></div></div>
        <span className="footer-symbol zh" aria-hidden="true">念长安</span>
      </div>
      <div className="footer-bottom"><span>Xi'an street food in Troy, Michigan</span><nav aria-label="Footer navigation"><Link href="/menu" data-testid="link-footer-menu">Menu</Link><Link href="/terms" data-testid="link-footer-terms">Terms</Link><Link href="/privacy" data-testid="link-footer-privacy">Privacy</Link></nav></div>
      <p className="footer-credit" data-testid="text-studio-credit">Built by Studio 1801</p>
    </div>
  </footer>;
}

function Home() {
  useReveal('home');
  const liveMenu = useLiveMenu(categories);
  const img = (name: string) => `${import.meta.env.BASE_URL}images/${name}`;
  return <>
    <PageMeta title="Miss Chang An 念长安 | Xi'an Noodles in Troy, MI" description="Miss Chang An is a family-owned Xi'an street food restaurant in Troy, Michigan. Hand-pulled noodles, cumin lamb roujiamo, liangpi, soup dumplings and boba. 5071 Rochester Rd. Order pickup online." />
    <section className="hero" aria-labelledby="hero-heading"><div className="wrap">
      <div className="hero-copy">
        <p className="hero-place"><span className="zh" aria-hidden="true">念长安</span><span>Troy, Michigan</span></p>
        <p className="hero-kicker">Authentic Xi'an street food</p>
        <h1 id="hero-heading"><span className="sr-only">Miss Chang An: </span><span className="h1-a">A taste of</span><em className="h1-b">Chang'an.</em></h1>
        <p className="hero-sub">Hand-pulled noodles • Roujiamo • Boba café</p>
        <div className="hero-status"><OpenBadge tone="light" /></div>
        <p className="hero-description">The street food of Xi'an, made with patience on Rochester Road. Pull-apart noodles, crisp roujiamo, slow broth and boba, served Tuesday to Sunday.</p>
        <div className="hero-actions"><a href="#order-here" className="button button-red" data-testid="link-hero-order">Build a pickup order <ArrowRight size={18} aria-hidden="true" /></a><Link href="/menu" className="text-link dark" data-testid="link-hero-menu">See the full menu</Link><a href="#visit" className="text-link dark" data-testid="link-hero-hours">Hours and map</a></div>
        <ul className="hero-facts"><li><strong>{REVIEWS.rating}</strong> Google rating</li><li><strong>Made daily</strong> noodles and dumplings</li><li><strong>Troy, MI</strong> open Tue to Sun</li></ul>
      </div>
      <div className="hero-photos"><img src={img('chili-oil-noodles.webp')} alt="Chili oil noodles in a white bowl with bok choy" decoding="async" /><img src={img('cumin-lamb-roujiamo.webp')} alt="Cumin lamb roujiamo in a crisp flatbread" decoding="async" /><img src={img('soup-dumplings.webp')} alt="Soup dumplings in a bamboo steamer" decoding="async" /><div className="sticker" aria-hidden="true"><span className="st-a">Hand pulled</span><span className="st-zh zh">每日新鲜</span><span className="st-b">Made daily</span></div></div>
    </div></section>
    <section className="proof" aria-labelledby="proof-heading"><div className="wrap">
      <div className="rating-card reveal"><div><div className="stars" role="img" aria-label={`${REVIEWS.rating} out of 5 stars`}>{'★★★★★'}</div><p className="rating-num">{REVIEWS.rating}</p><p className="rating-cap">Google rating</p></div><a href={REVIEWS.url} target="_blank" rel="noopener noreferrer" className="text-link dark" data-testid="link-read-reviews">Read on Google <ArrowUpRight size={16} aria-hidden="true" /></a></div>
      <div className="proof-head reveal"><span className="eyebrow">Guest reviews</span><h2 id="proof-heading">Worth the trip.</h2></div>
      <div className="quote-grid">{quotes.map((q, i) => <figure className="quote reveal" style={{ transitionDelay: `${i * 90}ms` }} key={`${q.source}-${q.author}`}><blockquote>{`\u201C${q.text}\u201D`}</blockquote><figcaption><span>{q.author} · {q.source}</span><a href={q.url} target="_blank" rel="noopener noreferrer" data-testid={`link-review-${q.source.toLowerCase()}`}>Read review <ArrowUpRight size={14} aria-hidden="true" /></a></figcaption></figure>)}</div>
      <div className="video-stories-head reveal" id="video-stories"><span className="eyebrow">More to see</span><h2>Video stories.</h2></div>
      <div className="video-stories-grid">
        {videoStories.map((video, index) => <figure className="video-story reveal" key={video.file} style={{ transitionDelay: `${index * 70}ms` }}>
          <video controls playsInline preload="none" poster={img(video.poster)} aria-label={video.title}>
            <source src={`/api/storage/public-objects/testimonials/${video.file}`} type="video/mp4" />
            Your browser does not support HTML video.
          </video>
          <figcaption>{video.title}</figcaption>
        </figure>)}
      </div>
    </div></section>
    <QuickOrder categories={liveMenu} />
    <section className="about wrap reveal" id="about" aria-labelledby="about-heading"><div><span className="eyebrow">About us</span><h2 id="about-heading">Missing <em>Chang'an.</em></h2><p>Chang'an is the old name for Xi'an, the city at the start of the Silk Road. 念 means to miss someone, to keep a place in mind. So the menu is the food Xi'an eats on the street, made here by hand: pulled noodles, roujiamo, the Chinese burger, and cold liangpi in chili oil. Boba and smoothies go alongside.</p><p className="aside">We used to be Nook Tea &amp; Cafe. We still make the boba.</p><p className="keywords">Cold noodles · Chinese burger · Spicy flavor · Rich broth · Traditional taste</p></div><img className="about-photo" src={img('lamb-bread-soup.webp')} alt="Lamb bread soup with torn flatbread, wood ear and cilantro" loading="lazy" decoding="async" /></section>
    <section className="dishes" id="dishes" aria-labelledby="featured-heading"><div className="wrap"><div className="section-heading reveal"><div><span className="eyebrow">Our dishes</span><h2 id="featured-heading">Start here.</h2></div><p>Prices from our ordering page</p></div><div className="featured-grid">{featured.map((item, index) => <article className="featured-item reveal" style={{ transitionDelay: `${(index % 2) * 90}ms` }} key={item.name}><div className="featured-media"><img className={`featured-image featured-image-${index + 1}`} src={img(item.image)} alt={item.name} loading="lazy" decoding="async" /></div><div className="featured-row"><h3>{item.name}<span className="featured-cn zh" lang="zh">{item.chinese}</span></h3><span className="featured-price">{item.price}</span></div><p>{item.description}</p></article>)}</div><Link href="/menu" className="text-link dark featured-link" data-testid="link-featured-menu">See the full menu <ArrowUpRight size={16} aria-hidden="true" /></Link></div></section>
    <section className="how wrap" aria-labelledby="how-heading"><div className="how-head reveal"><span className="eyebrow">How to order</span><h2 id="how-heading">Three ways<br />in.</h2></div><div className="how-list">
      <div className="how-row reveal"><h3>Pickup</h3><p>Build a pickup order preview here. Dumplings and noodles are prepared when ordered, so allow a little time.</p><a href="#order-here" className="text-link dark" data-testid="link-how-pickup">Build a pickup order</a></div>
      <div className="how-row reveal"><h3>Dine in</h3><p>Order at the counter or on the screen by the door. We are open until 9:00 pm, Tuesday to Sunday.</p><a href="#visit" className="text-link dark" data-testid="link-how-dine">Hours and map</a></div>
      <div className="how-row reveal"><h3>Delivery</h3><p>Ask when you call, or check our online ordering page for what is available to your address.</p><a href={PHONE} className="text-link dark" data-testid="link-how-delivery">Call (313) 825-7757</a></div>
    </div></section>
     <section className="visit" id="visit" aria-labelledby="visit-heading"><div className="wrap visit-grid"><div><span className="eyebrow">Find us</span><h2 id="visit-heading">Come<br /><span>hungry.</span></h2><OpenBadge tone="dark" /><p className="visit-address">{ADDRESS}</p><div className="visit-links"><a href={PHONE} data-testid="link-visit-phone">(313) 825-7757 <ArrowUpRight size={16} aria-hidden="true" /></a><a href={MAP_URL} target="_blank" rel="noopener noreferrer" data-testid="link-visit-directions">Directions <ArrowUpRight size={16} aria-hidden="true" /></a></div><p className="visit-note"><strong>Dine in, pickup, delivery</strong><br />Order at the counter or on the screen by the door. Soup dumplings are made when you order.</p>
       <aside className="reservation-card" id="reservations" aria-labelledby="reservation-heading"><span className="eyebrow">Reservations</span><h3 id="reservation-heading">Make an evening of it.</h3><p>Call our team to ask about table availability and make arrangements directly.</p><a className="button button-light reservation-cta" href={PHONE} data-testid="link-reservation-call"><CalendarDays size={17} aria-hidden="true" />Call to reserve <ArrowRight size={17} aria-hidden="true" /></a><span className="reservation-note">Tue–Sun · 11:30 am–9:00 pm</span></aside>
      </div></div></section>
  </>;
}

function MenuPage() {
  const live = useLiveMenu(categories);
  const [query, setQuery] = useState('');
  const [spicy, setSpicy] = useState(false);
  const [active, setActive] = useState(categories[0].id);
  const q = query.trim().toLowerCase();
  const shown = useMemo(() => live.map(category => ({
    ...category,
    items: category.items.filter(item => (!spicy || item.spice) && (!q || `${item.name} ${item.chinese ?? ''} ${item.description ?? ''}`.toLowerCase().includes(q))),
  })).filter(category => category.items.length > 0), [q, spicy]);
  const total = shown.reduce((sum, category) => sum + category.items.length, 0);
  useReveal(`menu-${q}-${spicy}`);
  useEffect(() => {
    if (!('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver(entries => {
      const hit = entries.filter(entry => entry.isIntersecting).sort((x, y) => x.boundingClientRect.top - y.boundingClientRect.top)[0];
      if (hit) setActive(hit.target.id);
    }, { rootMargin: '-15% 0px -70% 0px' });
    document.querySelectorAll('.menu-section').forEach(el => io.observe(el));
    return () => io.disconnect();
  }, [shown]);
  return <>
    <PageMeta title="Miss Chang An Menu" description="Full menu for Miss Chang An, Troy MI: Xi'an specials, hand-made noodle soups, roujiamo, liangpi, soup dumplings, dim sum and boba tea, with prices." />
    <section className="page-intro" aria-labelledby="menu-heading"><div className="wrap page-intro-inner"><span className="eyebrow">Miss Chang An, Troy MI</span><h1 id="menu-heading">Menu<span className="sr-only"> 菜单</span></h1><span className="intro-cn brush" aria-hidden="true">菜单</span><p>Xi'an street food, hand-made noodles, dim sum and boba at 5071 Rochester Rd, Troy. Prices as listed on our ordering page on 30 September 2026. "From" means the dish has choices, like bun type or size, that change the price.</p></div></section>
    <div className="wrap menu-tools"><label className="menu-search"><Search size={18} aria-hidden="true" /><span className="sr-only">Search the menu</span><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search noodles, lamb, dumplings" data-testid="input-menu-search" /></label><button type="button" className={`chip ${spicy ? 'on' : ''}`} aria-pressed={spicy} onClick={() => setSpicy(value => !value)} data-testid="button-filter-spicy">Spicy only</button><span className="menu-count" aria-live="polite">{total} {total === 1 ? 'dish' : 'dishes'}</span></div>
    <div className="wrap menu-layout"><aside className="menu-sidebar" aria-label="Menu categories"><span className="eyebrow">Jump to</span><div>{categories.map(category => <a key={category.id} href={`#${category.id}`} className={active === category.id ? 'active' : ''} aria-current={active === category.id ? 'true' : undefined} data-testid={`link-category-${category.id}`}>{category.title}</a>)}</div></aside><div>
      {total === 0 && <div className="menu-empty"><p>Nothing matches "{query}".</p><button type="button" className="text-link dark" onClick={() => { setQuery(''); setSpicy(false); }}>Clear filters</button></div>}
      {shown.map(category => <section className="menu-section" id={category.id} key={category.id} aria-labelledby={`heading-${category.id}`}><div className="menu-section-heading"><span className="brush" aria-hidden="true">{category.character}</span><h2 id={`heading-${category.id}`}>{category.title}</h2></div>{category.items.map((item, index) => <article className={`menu-item reveal ${item.soldOut ? 'sold' : ''}`} key={`${category.id}-${item.name}`} data-testid={`menu-item-${category.id}-${index}`}><div className="menu-item-body"><h3 className="menu-item-name">{item.name}{item.chinese && <span className="brush" lang="zh">{item.chinese}</span>}{item.spice && <span className="spice">{item.spice}</span>}{item.isNew && <span className="new-tag">New</span>}</h3>{item.description && <p>{item.description}</p>}{thumbs[item.name] && <img className="menu-thumb" src={`${import.meta.env.BASE_URL}images/${thumbs[item.name]}`} alt={item.name} loading="lazy" decoding="async" />}</div><span className="menu-price" data-testid={`text-price-${category.id}-${index}`}>{item.soldOut ? 'Sold out today' : item.price}</span></article>)}</section>)}
      <div className="menu-notice"><strong>Key</strong> SP: spicy. SP2 to SP5: spice level out of 5. Tell us about allergies when you order. The kitchen uses wheat, soy, sesame, peanuts, egg and shellfish.</div>
       <div className="menu-cta"><Link href="/#order-here" className="button button-red" data-testid="link-menu-order">Build a pickup order <ArrowRight size={18} aria-hidden="true" /></Link></div>
    </div></div>
  </>;
}

function LegalPage({ type }: { type: 'privacy' | 'terms' }) {
  const privacy = type === 'privacy';
  const title = privacy ? 'Privacy policy' : 'Terms of use';
  return <>
    <PageMeta title={privacy ? 'Miss Chang An Privacy' : 'Miss Chang An Terms'} description={privacy ? 'Privacy policy for the Miss Chang An website, Troy MI.' : 'Terms of use for the Miss Chang An website, Troy MI.'} />
    <section className="page-intro legal-intro" aria-labelledby="legal-heading"><div className="wrap page-intro-inner"><span className="eyebrow">The small print</span><h1 id="legal-heading">{title}</h1><span className="intro-cn brush" aria-hidden="true">念</span><p>Last updated 2 October 2026</p></div></section>
    <div className="wrap legal-layout"><aside className="legal-side">Miss Chang An<br />Troy, Michigan</aside><div>{legalContent[type].map(([heading, body]) => <section className="legal-section" key={heading}><h2>{heading}</h2><p>{body}</p></section>)}</div></div>
  </>;
}

function NotFound() {
  return <div className="not-found"><div><span className="eyebrow">Wrong turn</span><h1>404</h1><p>This page isn't on the menu.</p><Link href="/" className="button button-red" data-testid="link-not-found-home">Back home <ArrowRight size={18} aria-hidden="true" /></Link></div></div>;
}

function DashboardRedirect() {
  useEffect(() => {
    window.location.replace(`${import.meta.env.BASE_URL}dashboard/index.html${window.location.search}${window.location.hash}`);
  }, []);
  return <div className="not-found"><p>Opening the staff dashboard…</p></div>;
}

function App() {
  const live = useLiveMenu(categories);
  const [location] = useLocation();
  return <><a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:bg-[#f7efe2] focus:p-4" data-testid="link-skip-content">Skip to content</a><Header /><main id="main-content" tabIndex={-1}><div className="route-transition" key={location}><Switch><Route path="/" component={Home} /><Route path="/menu" component={MenuPage} /><Route path="/order"><PageMeta title="Order Pickup Preview | Miss Chang An" description="Build and review a Miss Chang An pickup order in our in-house ordering prototype." /><OrderPage categories={live} /></Route><Route path="/dashboard" component={DashboardRedirect} /><Route path="/privacy">{() => <LegalPage type="privacy" />}</Route><Route path="/terms">{() => <LegalPage type="terms" />}</Route><Route component={NotFound} /></Switch></div></main><Footer /><ChatWidget categories={live} phone={PHONE} instagram={INSTAGRAM_URL} mapUrl={MAP_URL} address={ADDRESS} /><RouteAccessibility /></>;
}

export default App;