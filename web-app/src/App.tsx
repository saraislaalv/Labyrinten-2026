import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Feed } from "./components/Feed";
import { GenericMainTopicPage } from "./components/GenericMainTopicPage";
import { GroupMapExplorer } from "./components/GroupMapExplorer";
import { MainTopicsMapPage, type FeaturedTopicStory } from "./components/MainTopicsMapPage";
import { MapExplorer } from "./components/MapExplorer";
import { MidtostenTopicPage } from "./components/MidtostenTopicPage";
import { getFeed } from "./services/feed";
import { getHighlightStoryIds } from "./services/highlights";
import { getMainTopics, getMainTopicsMap } from "./services/mainTopics";
import { getMapPoints } from "./services/mapPoints";
import type { FeedItem } from "./types/feed";
import type { MainTopic, MainTopicMapSummary } from "./types/mainTopics";
import type { MapPoint } from "./types/map";
import "./App.css";

type TopicSubRoute = "landing" | "timeline" | "live";
type MapMode = "stories" | "topics";
type EmbeddedTopicRoute = "main-topics" | string;
type EmbeddedTopicTransitionPhase = "steady" | "out" | "in";

const EMBEDDED_TOPIC_FADE_OUT_MS = 130;
const EMBEDDED_TOPIC_FADE_IN_MS = 210;

type RoutePath =
  | "/"
  | "/groups"
  | "/main-topics"
  | "/ukraina"
  | "/usa"
  | "/sudan"
  | "/norge"
  | "/midtosten"
  | "/midtosten/hva-har-skjedd"
  | "/midtosten/dette-skjer-na"
  | `/topic/${string}`;

const KNOWN_ROUTES = new Set<RoutePath>([
  "/",
  "/groups",
  "/main-topics",
  "/ukraina",
  "/usa",
  "/sudan",
  "/norge",
  "/midtosten",
  "/midtosten/hva-har-skjedd",
  "/midtosten/dette-skjer-na",
]);

const GENERIC_TOPIC_ROUTES = new Set<RoutePath>(["/ukraina", "/usa", "/sudan", "/norge"]);

const TOPIC_ROUTE_BY_ID: Record<string, RoutePath> = {
  midtosten: "/midtosten",
  ukraina: "/ukraina",
  usa: "/usa",
  sudan: "/sudan",
  norge: "/norge",
};

function normalizeRoutePath(rawPath: string): RoutePath {
  const trimmedPath = rawPath.length > 1 && rawPath.endsWith("/") ? rawPath.slice(0, -1) : rawPath;

  if (KNOWN_ROUTES.has(trimmedPath as RoutePath)) {
    return trimmedPath as RoutePath;
  }

  if (trimmedPath.startsWith("/topic/") && trimmedPath.length > "/topic/".length) {
    return trimmedPath as RoutePath;
  }

  return "/";
}

function getTopicMode(path: RoutePath): TopicSubRoute {
  if (path === "/midtosten/hva-har-skjedd") {
    return "timeline";
  }

  if (path === "/midtosten/dette-skjer-na") {
    return "live";
  }

  return "landing";
}

function toTopicRoute(topicId: string): RoutePath {
  const knownRoute = TOPIC_ROUTE_BY_ID[topicId];

  if (knownRoute) {
    return knownRoute;
  }

  return `/topic/${encodeURIComponent(topicId)}`;
}

function getGenericTopicIdByRoute(path: RoutePath): string | null {
  if (path.startsWith("/topic/")) {
    return decodeURIComponent(path.slice("/topic/".length));
  }

  if (path === "/ukraina") {
    return "ukraina";
  }

  if (path === "/usa") {
    return "usa";
  }

  if (path === "/sudan") {
    return "sudan";
  }

  if (path === "/norge") {
    return "norge";
  }

  return null;
}

function toEmbeddedTopicRoute(topicId: string): EmbeddedTopicRoute {
  return topicId;
}

function getGenericTopicIdByEmbeddedRoute(route: EmbeddedTopicRoute): string | null {
  if (route === "main-topics") {
    return null;
  }

  return route;
}

const MOCK_FEATURED_TOPIC_STORIES: Record<string, FeaturedTopicStory> = {
  midtosten: {
    topicId: "midtosten",
    storyId: "mock-midtosten-featured",
    title: "Eksplosjoner ryster Midtosten etter natt med drone-angrep",
    description:
      "Natten til i dag ble strategiske mal angrepet flere steder i regionen. Diplomater advarer mot videre eskalering.",
    category: "conflict",
    lat: 33.5138,
    lon: 36.2765,
    country: "Syria",
    city: "Damaskus",
    publishedAt: new Date().toISOString(),
    isMock: true,
  },
  ukraina: {
    topicId: "ukraina",
    storyId: "mock-ukraina-featured",
    title: "Ny forhandlingsrunde om Ukraina-krigen starter i Geneve",
    description: "Partene moter igjen etter flere mindre gjennombrudd om fanger og korridorer.",
    category: "politics",
    lat: 50.4501,
    lon: 30.5234,
    country: "Ukraina",
    city: "Kyiv",
    publishedAt: new Date().toISOString(),
    isMock: true,
  },
  usa: {
    topicId: "usa",
    storyId: "mock-usa-featured",
    title: "Storpolitisk duell i Washington om ny handelstariff",
    description: "Forslaget kan endre forholdet til flere viktige allierte.",
    category: "politics",
    lat: 38.9072,
    lon: -77.0369,
    country: "USA",
    city: "Washington D.C.",
    publishedAt: new Date().toISOString(),
    isMock: true,
  },
  sudan: {
    topicId: "sudan",
    storyId: "mock-sudan-featured",
    title: "Ny flukt-bolge fra Khartoum etter tunge kamper",
    description: "FN melder om rekordstor humanitaer krise i nabolandene.",
    category: "conflict",
    lat: 15.5007,
    lon: 32.5599,
    country: "Sudan",
    city: "Khartoum",
    publishedAt: new Date().toISOString(),
    isMock: true,
  },
  norge: {
    topicId: "norge",
    storyId: "mock-norge-featured",
    title: "Storting i dragkamp om ny statsbudsjett-sak",
    description: "Opposisjonen krever endringer for a sikre flertall.",
    category: "politics",
    lat: 59.9139,
    lon: 10.7522,
    country: "Norge",
    city: "Oslo",
    publishedAt: new Date().toISOString(),
    isMock: true,
  },
};

function deriveFeaturedTopicStories(
  mainTopics: MainTopic[],
  mainTopicsMap: MainTopicMapSummary[],
): FeaturedTopicStory[] {
  const byTopicId = new Map<string, FeaturedTopicStory>();

  for (const topic of mainTopics) {
    const relevant = topic.relevantStories[0];
    if (relevant) {
      byTopicId.set(topic.id, {
        topicId: topic.id,
        storyId: relevant.storyId,
        title: relevant.title,
        description: null,
        category: relevant.category,
        lat: relevant.lat,
        lon: relevant.lon,
        country: relevant.country,
        city: relevant.city,
        publishedAt: relevant.publishedAt,
        isMock: false,
      });
    }
  }

  const topicIds = new Set<string>();
  for (const topic of mainTopicsMap) {
    topicIds.add(topic.id);
  }
  for (const topic of mainTopics) {
    topicIds.add(topic.id);
  }

  for (const topicId of topicIds) {
    if (byTopicId.has(topicId)) {
      continue;
    }

    const mock = MOCK_FEATURED_TOPIC_STORIES[topicId];
    if (mock) {
      byTopicId.set(topicId, mock);
    }
  }

  return Array.from(byTopicId.values());
}

function App() {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [highlightStoryIds, setHighlightStoryIds] = useState<string[]>([]);
  const [mapPoints, setMapPoints] = useState<MapPoint[]>([]);
  const [view, setView] = useState<"map" | "feed">("feed");
  const [mapMode, setMapMode] = useState<MapMode>("stories");
  const [embeddedTopicRoute, setEmbeddedTopicRoute] = useState<EmbeddedTopicRoute>("main-topics");
  const [embeddedTopicTransitionPhase, setEmbeddedTopicTransitionPhase] =
    useState<EmbeddedTopicTransitionPhase>("steady");
  const [activeFeedStoryId, setActiveFeedStoryId] = useState<string | null>(null);
  const [selectedStoryId, setSelectedStoryId] = useState<string | null>(null);
  const [mapFocusRequest, setMapFocusRequest] = useState<{ storyId: string | null; token: number }>({
    storyId: null,
    token: 0,
  });
  const [mapStatus, setMapStatus] = useState<"loading" | "ready" | "error">("loading");
  const [feedStatus, setFeedStatus] = useState<"loading" | "ready" | "error">("loading");
  const [mapPresentationToken, setMapPresentationToken] = useState(0);
  const [routePath, setRoutePath] = useState<RoutePath>(() => normalizeRoutePath(window.location.pathname));
  const [mainTopicsMap, setMainTopicsMap] = useState<MainTopicMapSummary[]>([]);
  const [mainTopicsMapStatus, setMainTopicsMapStatus] = useState<"loading" | "ready" | "error">("loading");
  const [mainTopics, setMainTopics] = useState<MainTopic[]>([]);
  const [mainTopicsStatus, setMainTopicsStatus] = useState<"loading" | "ready" | "error">("loading");
  const swipeViewportRef = useRef<HTMLElement | null>(null);
  const scrollSettleTimeoutRef = useRef<number | null>(null);
  const embeddedTopicRouteRef = useRef<EmbeddedTopicRoute>("main-topics");
  const embeddedTopicFadeOutTimeoutRef = useRef<number | null>(null);
  const embeddedTopicFadeInTimeoutRef = useRef<number | null>(null);
  const viewRef = useRef<"map" | "feed">(view);

  const isGroupsRoute = routePath === "/groups";
  const isMainTopicsRoute = routePath === "/main-topics";
  const isMidtostenRoute =
    routePath === "/midtosten" || routePath === "/midtosten/hva-har-skjedd" || routePath === "/midtosten/dette-skjer-na";
  const isGenericTopicRoute = GENERIC_TOPIC_ROUTES.has(routePath) || routePath.startsWith("/topic/");

  const genericTopicId = useMemo(() => getGenericTopicIdByRoute(routePath), [routePath]);
  const genericTopic = useMemo(
    () => mainTopics.find((topic) => topic.id === genericTopicId) ?? null,
    [genericTopicId, mainTopics],
  );
  const midtostenTopic = useMemo(
    () => mainTopics.find((topic) => topic.id === "midtosten") ?? null,
    [mainTopics],
  );
  const midtostenMode = useMemo(() => getTopicMode(routePath), [routePath]);

  const featuredTopicStories = useMemo<FeaturedTopicStory[]>(
    () => deriveFeaturedTopicStories(mainTopics, mainTopicsMap),
    [mainTopics, mainTopicsMap],
  );

  const navigateTo = useCallback(
    (path: RoutePath) => {
      const normalized = normalizeRoutePath(path);
      if (normalized === routePath) {
        return;
      }

      window.history.pushState({}, "", normalized);
      setRoutePath(normalized);
    },
    [routePath],
  );

  const showFeed = useCallback(() => {
    setView("feed");
    if (routePath !== "/") {
      navigateTo("/");
    }
  }, [navigateTo, routePath]);

  const openStoryInFeed = useCallback(
    (storyId: string) => {
      setSelectedStoryId(storyId);
      setMapMode("stories");
      setView("feed");
      if (routePath !== "/") {
        navigateTo("/");
      }
    },
    [navigateTo, routePath],
  );

  const requestMapFocus = useCallback((storyId: string | null) => {
    setMapFocusRequest((current) => ({
      storyId,
      token: current.token + 1,
    }));
  }, []);

  const openStoryInMap = useCallback(
    (storyId: string | null) => {
      requestMapFocus(storyId);
      setMapMode("stories");
      setView("map");
      if (routePath !== "/") {
        navigateTo("/");
      }
    },
    [navigateTo, requestMapFocus, routePath],
  );

  const clearEmbeddedTopicTransitionTimers = useCallback(() => {
    if (embeddedTopicFadeOutTimeoutRef.current !== null) {
      window.clearTimeout(embeddedTopicFadeOutTimeoutRef.current);
      embeddedTopicFadeOutTimeoutRef.current = null;
    }

    if (embeddedTopicFadeInTimeoutRef.current !== null) {
      window.clearTimeout(embeddedTopicFadeInTimeoutRef.current);
      embeddedTopicFadeInTimeoutRef.current = null;
    }
  }, []);

  const transitionToEmbeddedTopicRoute = useCallback(
    (nextRoute: EmbeddedTopicRoute) => {
      const currentRoute = embeddedTopicRouteRef.current;
      clearEmbeddedTopicTransitionTimers();

      if (nextRoute === currentRoute) {
        setEmbeddedTopicTransitionPhase("steady");
        return;
      }

      setEmbeddedTopicTransitionPhase("out");
      embeddedTopicFadeOutTimeoutRef.current = window.setTimeout(() => {
        setEmbeddedTopicRoute(nextRoute);
        embeddedTopicRouteRef.current = nextRoute;
        setEmbeddedTopicTransitionPhase("in");
        embeddedTopicFadeOutTimeoutRef.current = null;

        embeddedTopicFadeInTimeoutRef.current = window.setTimeout(() => {
          setEmbeddedTopicTransitionPhase("steady");
          embeddedTopicFadeInTimeoutRef.current = null;
        }, EMBEDDED_TOPIC_FADE_IN_MS);
      }, EMBEDDED_TOPIC_FADE_OUT_MS);
    },
    [clearEmbeddedTopicTransitionTimers],
  );

  const openTopicsMap = useCallback(() => {
    transitionToEmbeddedTopicRoute("main-topics");
    setMapMode("topics");
    setView("map");
    if (routePath !== "/") {
      navigateTo("/");
    }
  }, [navigateTo, routePath, transitionToEmbeddedTopicRoute]);

  const openEmbeddedTopic = useCallback(
    (topicId: string) => {
      transitionToEmbeddedTopicRoute(toEmbeddedTopicRoute(topicId));
      setMapMode("topics");
      setView("map");
    },
    [transitionToEmbeddedTopicRoute],
  );

  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  useEffect(() => {
    embeddedTopicRouteRef.current = embeddedTopicRoute;
  }, [embeddedTopicRoute]);

  useEffect(() => {
    if (window.location.pathname !== routePath) {
      window.history.replaceState({}, "", routePath);
    }
  }, [routePath]);

  useEffect(() => {
    const onPopState = () => {
      setRoutePath(normalizeRoutePath(window.location.pathname));
    };

    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadAppData = async () => {
      const [mapPointsResult, feedResult, highlightsResult] = await Promise.allSettled([
        getMapPoints(),
        getFeed(),
        getHighlightStoryIds(),
      ]);

      if (!isMounted) {
        return;
      }

      if (mapPointsResult.status === "fulfilled") {
        setMapPoints(mapPointsResult.value);
        setMapStatus("ready");
      } else {
        console.error("Failed to load map points", mapPointsResult.reason);
        setMapStatus("error");
      }

      if (feedResult.status === "fulfilled") {
        setItems(feedResult.value);
        setFeedStatus("ready");
      } else {
        console.error("Failed to load feed", feedResult.reason);
        setFeedStatus("error");
      }

      if (highlightsResult.status === "fulfilled") {
        setHighlightStoryIds(highlightsResult.value);
      } else {
        console.error("Failed to load highlights", highlightsResult.reason);
      }
    };

    void loadAppData();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadMainTopicsMapData = async () => {
      try {
        const topicsMap = await getMainTopicsMap();

        if (!isMounted) {
          return;
        }

        setMainTopicsMap(topicsMap);
        setMainTopicsMapStatus("ready");
      } catch (error) {
        if (!isMounted) {
          return;
        }

        console.error("Failed to load main topics map", error);
        setMainTopicsMapStatus("error");
      }
    };

    void loadMainTopicsMapData();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadMainTopicsData = async () => {
      try {
        const topics = await getMainTopics();

        if (!isMounted) {
          return;
        }

        setMainTopics(topics);
        setMainTopicsStatus("ready");
      } catch (error) {
        if (!isMounted) {
          return;
        }

        console.error("Failed to load main topics", error);
        setMainTopicsStatus("error");
      }
    };

    void loadMainTopicsData();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const viewport = swipeViewportRef.current;

    if (!viewport) {
      return;
    }

    const targetLeft = view === "map" ? viewport.clientWidth : 0;
    const alreadyAtTarget = Math.abs(viewport.scrollLeft - targetLeft) < 2;

    if (alreadyAtTarget) {
      if (view === "map") {
        const animationFrameId = window.requestAnimationFrame(() => {
          setMapPresentationToken((current) => current + 1);
        });

        return () => {
          window.cancelAnimationFrame(animationFrameId);
        };
      }

      return;
    }

    viewport.scrollTo({
      left: targetLeft,
      behavior: "smooth",
    });

    const timeoutId = window.setTimeout(() => {
      if (viewRef.current === "map") {
        setMapPresentationToken((current) => current + 1);
      }
    }, 380);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [view]);

  useEffect(() => {
    return () => {
      if (scrollSettleTimeoutRef.current !== null) {
        window.clearTimeout(scrollSettleTimeoutRef.current);
      }

      clearEmbeddedTopicTransitionTimers();
    };
  }, [clearEmbeddedTopicTransitionTimers]);

  useEffect(() => {
    const viewport = swipeViewportRef.current;

    if (!viewport) {
      return;
    }

    const handleWheel = (event: WheelEvent) => {
      const eventTarget = event.target;

      if (!(eventTarget instanceof Node) || !viewport.contains(eventTarget)) {
        return;
      }

      if (Math.abs(event.deltaX) <= Math.abs(event.deltaY) * 0.6) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      viewport.scrollLeft += event.deltaX;
    };

    viewport.addEventListener("wheel", handleWheel, { passive: false, capture: true });

    return () => {
      viewport.removeEventListener("wheel", handleWheel, { capture: true });
    };
  }, []);

  const handleViewportScroll = useCallback(() => {
    const viewport = swipeViewportRef.current;

    if (!viewport || viewport.clientWidth <= 0) {
      return;
    }

    if (scrollSettleTimeoutRef.current !== null) {
      window.clearTimeout(scrollSettleTimeoutRef.current);
    }

    scrollSettleTimeoutRef.current = window.setTimeout(() => {
      const currentViewport = swipeViewportRef.current;

      if (!currentViewport || currentViewport.clientWidth <= 0) {
        return;
      }

      const nextView = currentViewport.scrollLeft >= currentViewport.clientWidth / 2 ? "map" : "feed";

      if (nextView === viewRef.current || viewRef.current === "map") {
        return;
      }

      if (nextView === "map") {
        openStoryInMap(activeFeedStoryId);
      }
    }, 120);
  }, [activeFeedStoryId, openStoryInMap]);

  const renderRouteTabs = useCallback(
    (activeTab: "tema" | "midtosten") => (
      <nav className="app-tabs app-tabs--floating" aria-label="Kartvisninger">
        <button type="button" className="app-tab" onClick={() => navigateTo("/")}>
          Saker
        </button>
        <button
          type="button"
          className={`app-tab ${activeTab === "tema" ? "app-tab--active" : ""}`}
          onClick={() => navigateTo("/main-topics")}
        >
          Tema
        </button>
        <button
          type="button"
          className={`app-tab ${activeTab === "midtosten" ? "app-tab--active" : ""}`}
          onClick={() => navigateTo("/midtosten")}
        >
          Midtosten
        </button>
      </nav>
    ),
    [navigateTo],
  );

  const renderEmbeddedTopicsContent = () => {
    if (embeddedTopicRoute === "main-topics") {
      if (mainTopicsMapStatus === "loading") {
        return (
          <section className="app-state app-state--inline">
            <p>Laster temaoversikten...</p>
          </section>
        );
      }

      if (mainTopicsMapStatus === "error") {
        return (
          <section className="app-state app-state--inline">
            <p>Kunne ikke laste temaoversikten.</p>
          </section>
        );
      }

      return (
        <MainTopicsMapPage
          topics={mainTopicsMap}
          storyPoints={mapPoints}
          featuredStories={featuredTopicStories}
          onOpenTopic={openEmbeddedTopic}
          onOpenStory={openStoryInFeed}
        />
      );
    }

    if (mainTopicsStatus === "loading") {
      return (
        <section className="app-state app-state--inline">
          <p>Laster tema...</p>
        </section>
      );
    }

    const embeddedTopicId = getGenericTopicIdByEmbeddedRoute(embeddedTopicRoute);
    const embeddedTopic = embeddedTopicId ? mainTopics.find((topic) => topic.id === embeddedTopicId) ?? null : null;

    if (mainTopicsStatus === "error" || !embeddedTopic) {
      return (
        <section className="app-state app-state--inline">
          <p>Kunne ikke laste dette temaet.</p>
        </section>
      );
    }

    if (embeddedTopic.id === "midtosten") {
      return (
        <MidtostenTopicPage
          topic={embeddedTopic}
          mode="landing"
          onExitToMainTopics={() => transitionToEmbeddedTopicRoute("main-topics")}
          onOpenStory={openStoryInFeed}
        />
      );
    }

    return (
      <GenericMainTopicPage
        topic={embeddedTopic}
        onExitToMainTopics={() => transitionToEmbeddedTopicRoute("main-topics")}
        onOpenStory={openStoryInFeed}
      />
    );
  };

  const embeddedTopicStageClassName =
    embeddedTopicTransitionPhase === "out"
      ? "app-topic-stage app-topic-stage--out"
      : embeddedTopicTransitionPhase === "in"
        ? "app-topic-stage app-topic-stage--in"
        : "app-topic-stage";

  if (isGroupsRoute) {
    if (mapStatus === "loading") {
      return (
        <main className="app-state">
          <p>Laster kartpunkter...</p>
        </main>
      );
    }

    if (mapStatus === "error") {
      return (
        <main className="app-state">
          <p>Kunne ikke laste kartdata.</p>
        </main>
      );
    }

    return (
      <main className="app">
        <div className="app-device">
          <section className="app-content">
            <GroupMapExplorer points={mapPoints} />
          </section>
        </div>
      </main>
    );
  }

  if (isMainTopicsRoute) {
    return (
      <main className="app">
        <div className="app-device">
          {renderRouteTabs("tema")}

          <section className="app-content">
            {mainTopicsMapStatus === "loading" ? (
              <section className="app-state app-state--inline">
                <p>Laster temaoversikten...</p>
              </section>
            ) : mainTopicsMapStatus === "error" ? (
              <section className="app-state app-state--inline">
                <p>Kunne ikke laste overordnet topics-kart.</p>
              </section>
            ) : (
              <MainTopicsMapPage
                topics={mainTopicsMap}
                storyPoints={mapPoints}
                featuredStories={featuredTopicStories}
                onOpenTopic={(topicId) => {
                  navigateTo(toTopicRoute(topicId));
                }}
                onOpenStory={openStoryInFeed}
              />
            )}
          </section>
        </div>
      </main>
    );
  }

  if (isGenericTopicRoute) {
    return (
      <main className="app">
        <div className="app-device">
          {renderRouteTabs("tema")}

          <section className="app-content">
            {mainTopicsStatus === "loading" ? (
              <section className="app-state app-state--inline">
                <p>Laster tema...</p>
              </section>
            ) : mainTopicsStatus === "error" || !genericTopic ? (
              <section className="app-state app-state--inline">
                <p>Kunne ikke laste dette temaet.</p>
              </section>
            ) : (
              <GenericMainTopicPage
                topic={genericTopic}
                onExitToMainTopics={() => navigateTo("/main-topics")}
                onOpenStory={openStoryInFeed}
              />
            )}
          </section>
        </div>
      </main>
    );
  }

  if (isMidtostenRoute) {
    return (
      <main className="app">
        <div className="app-device">
          {renderRouteTabs("midtosten")}

          <section className="app-content">
            {mainTopicsStatus === "loading" ? (
              <section className="app-state app-state--inline">
                <p>Laster Midtosten...</p>
              </section>
            ) : mainTopicsStatus === "error" || !midtostenTopic ? (
              <section className="app-state app-state--inline">
                <p>Kunne ikke laste Midtosten-data.</p>
              </section>
            ) : (
              <MidtostenTopicPage
                topic={midtostenTopic}
                mode={midtostenMode}
                onExitToMainTopics={() => navigateTo("/main-topics")}
                onOpenStory={openStoryInFeed}
              />
            )}
          </section>
        </div>
      </main>
    );
  }

  if (mapStatus === "loading") {
    return (
      <main className="app-state">
        <p>Laster kartpunkter...</p>
      </main>
    );
  }

  if (mapStatus === "error") {
    return (
      <main className="app-state">
        <p>Kunne ikke laste kartdata.</p>
      </main>
    );
  }

  return (
    <main className="app">
      <div className="app-device">
        {view === "feed" ? (
          <button
            type="button"
            className="app-nav-button"
            aria-label="Apne kart"
            onClick={() => openStoryInMap(null)}
          >
            <svg
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="2" y1="12" x2="22" y2="12" />
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>
          </button>
        ) : (
          <button
            type="button"
            className="app-nav-button"
            aria-label="Tilbake til feed"
            onClick={showFeed}
          >
            <svg
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}

        {view === "map" ? (
          <>
            <nav className="app-tabs app-tabs--floating" aria-label="Kartvisninger">
              <button
                type="button"
                className={`app-tab ${mapMode === "stories" ? "app-tab--active" : ""}`}
                onClick={() => openStoryInMap(activeFeedStoryId)}
              >
                Saker
              </button>
              <button
                type="button"
                className={`app-tab ${mapMode === "topics" ? "app-tab--active" : ""}`}
                onClick={openTopicsMap}
              >
                Tema
              </button>
            </nav>

            {mapMode === "topics" && embeddedTopicRoute !== "main-topics" ? (
              <button
                type="button"
                className="app-subnav-button"
                onClick={() => transitionToEmbeddedTopicRoute("main-topics")}
              >
                Til temaoversikt
              </button>
            ) : null}
          </>
        ) : null}

        <section
          ref={swipeViewportRef}
          className="app-content app-swipe-viewport"
          onScroll={handleViewportScroll}
        >
          <section
            className={`app-panel app-panel--feed ${view === "feed" ? "app-panel--active" : "app-panel--inactive"}`}
            aria-hidden={view !== "feed"}
          >
            {feedStatus === "ready" ? (
              <section className="feed-view">
                <Feed
                  items={items}
                  introMapPoints={mapPoints}
                  introHighlightStoryIds={highlightStoryIds}
                  selectedStoryId={selectedStoryId}
                  onStorySelect={openStoryInFeed}
                  onSwipeToMap={openStoryInMap}
                  onActiveStoryChange={setActiveFeedStoryId}
                  onSelectedStoryReached={() => setSelectedStoryId(null)}
                />
              </section>
            ) : feedStatus === "loading" ? (
              <section className="app-state app-state--inline">
                <p>Laster feed-visningen...</p>
              </section>
            ) : (
              <section className="app-state app-state--inline">
                <p>Feed-visningen kunne ikke lastes, men kartet er tilgjengelig.</p>
              </section>
            )}
          </section>

          <section
            className={`app-panel app-panel--map ${view === "map" ? "app-panel--active" : "app-panel--inactive"}`}
            aria-hidden={view !== "map"}
          >
            {mapMode === "stories" ? (
              <MapExplorer
                points={mapPoints}
                onStorySelect={openStoryInFeed}
                requestedStoryId={mapFocusRequest.storyId}
                requestToken={mapFocusRequest.token}
                presentationToken={mapPresentationToken}
                isVisible={view === "map"}
              />
            ) : (
              <div key={embeddedTopicRoute} className={embeddedTopicStageClassName}>
                {renderEmbeddedTopicsContent()}
              </div>
            )}
          </section>
        </section>
      </div>
    </main>
  );
}

export default App;
