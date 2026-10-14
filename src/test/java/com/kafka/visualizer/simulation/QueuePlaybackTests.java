package com.kafka.visualizer.simulation;

import org.junit.jupiter.api.Test;
import java.util.*;
import java.util.concurrent.atomic.AtomicLong;
import static org.junit.jupiter.api.Assertions.*;

@SuppressWarnings("unchecked")
class QueuePlaybackTests {
    private SimulationEngine engine(int producers, List<String> memberships, double speed) {
        var e=new SimulationEngine();var c=Configuration.preset(2,1,2,memberships,10,speed);
        var ps=new ArrayList<Configuration.Producer>();
        for(int i=1;i<=producers;i++)ps.add(new Configuration.Producer("p"+i,"Service-"+i,"t1",10,false,"key-"+i,"template-"+i));
        e.apply(new Configuration(1,c.brokers(),c.topics(),ps,c.groups(),c.consumers(),600,500,false),true,null);return e;
    }
    private List<SimulationEngine.PendingMessage> queue(SimulationEngine e,int i) {
        var qs=(List<Map<String,Object>>)e.snapshot(0).get("producerQueues");return (List<SimulationEngine.PendingMessage>)qs.get(i).get("messages");
    }
    private void command(SimulationEngine e,String type,String id) {e.command(new SimulationEngine.Command(type,id,null,null,null));}
    private long count(SimulationEngine e){return (long)e.snapshot(0).get("messageCount");}
    private void finish(SimulationEngine e){for(int i=0;e.shouldAdvance()&&i<10000;i++)e.advanceIfRunning();assertFalse(e.shouldAdvance());}
    private List<SimulationEngine.Event> events(SimulationEngine e){return (List<SimulationEngine.Event>)e.snapshot(0).get("events");}
    @Test void queueIsUpcomingAndIdsAreUniqueAcrossProducers() {
        var e=engine(3,List.of("g"),10);var all=new HashSet<String>();
        for(int i=0;i<3;i++){assertEquals(10,queue(e,i).size());for(var m:queue(e,i))assertTrue(all.add(m.id()));}
        assertEquals(0,count(e));assertEquals("M1",queue(e,0).get(0).id());assertEquals("M2",queue(e,1).get(0).id());
    }
    @Test void requestDoesNotPublishUntilTickAndRefillsWithSameDepartingIdentity() {
        var e=engine(1,List.of("g"),10);var first=queue(e,0).get(0);
        command(e,"PRODUCE","p1");assertEquals(0,count(e));assertTrue(queue(e,0).get(0).requested());
        e.advanceIfRunning();assertEquals(1,count(e));assertEquals("M2",queue(e,0).get(0).id());assertEquals("M11",queue(e,0).get(9).id());
        var produced=events(e).stream().filter(v->v.stage().equals("PRODUCED")).findFirst().orElseThrow();
        assertEquals(first.id(),produced.messageId());assertEquals(first.key(),produced.message().key());assertEquals(0,produced.message().offset());
    }
    @Test void manualJourneyProcessesAllGroupsAndDoesNotForceCommitOrAutomaticProduction() {
        var e=engine(1,List.of("results","reports"),1);var c=e.configuration();
        e.apply(new Configuration(1,c.brokers(),c.topics(),List.of(new Configuration.Producer("p1","AutoService","t1",10,true,"","automatic")),c.groups(),c.consumers(),600,500,true),false,null);
        e.command(new SimulationEngine.Command("PRODUCE","p1","override","custom",null));finish(e);
        assertEquals(1,count(e));assertEquals(2,events(e).stream().filter(v->v.stage().equals("PROCESSED")).count());
        assertFalse(events(e).stream().anyMatch(v->v.stage().equals("COMMITTED")));assertEquals(false,e.snapshot(0).get("running"));
        assertEquals("custom",events(e).stream().filter(v->v.stage().equals("PRODUCED")).findFirst().orElseThrow().message().payload());
    }
    @Test void manualRequestsAreBoundedFifoAndDefaultsAreNotOverriddenByOtherRequests() {
        var e=engine(1,List.of("g"),10);
        e.command(new SimulationEngine.Command("PRODUCE","p1","special","one",null));
        for(int i=1;i<10;i++)command(e,"PRODUCE","p1");
        assertThrows(SimulationException.class,()->command(e,"PRODUCE","p1"));finish(e);assertEquals(10,count(e));
        var published=events(e).stream().filter(v->v.stage().equals("PRODUCED")).map(SimulationEngine.Event::message).toList();
        assertEquals("one",published.get(0).payload());assertEquals("template-1",published.get(1).payload());
        assertEquals(java.util.stream.LongStream.rangeClosed(1,10).mapToObj(i->"M"+i).toList(),published.stream().map(SimulationEngine.Message::id).toList());
    }
    @Test void unavailableLeaderKeepsHeadAndPublishesAfterRecovery() {
        var e=engine(1,List.of("g"),10);command(e,"BROKER_STOP","b1");command(e,"BROKER_STOP","b2");command(e,"PRODUCE","p1");
        assertFalse(e.shouldAdvance());assertEquals("M1",queue(e,0).get(0).id());assertTrue(queue(e,0).get(0).requested());assertEquals(0,count(e));
        assertTrue(e.snapshot(0).get("manualStatus").toString().startsWith("Waiting"));
        command(e,"BROKER_RESTART","b1");finish(e);assertEquals(1,count(e));
    }
    @Test void pausedConsumerWaitsWithoutSpinningAndResumeCompletes() {
        var e=engine(1,List.of("g"),10);command(e,"CONSUMER_PAUSE","c1");command(e,"PRODUCE","p1");e.advanceIfRunning();
        assertFalse(e.shouldAdvance());assertEquals(true,e.snapshot(0).get("manualFlow"));
        assertEquals("Waiting for eligible consumer",e.snapshot(0).get("manualStatus"));
        command(e,"CONSUMER_RESUME","c1");finish(e);assertEquals(1,events(e).stream().filter(v->v.stage().equals("PROCESSED")).count());
    }
    @Test void manualPauseFreezesAndResumeContinuesTheSameJourney() {
        var e=engine(1,List.of("g"),.25);command(e,"PRODUCE","p1");e.advanceIfRunning();command(e,"PAUSE",null);
        long tick=(long)e.snapshot(0).get("tick");e.advanceIfRunning();assertEquals(tick,e.snapshot(0).get("tick"));
        command(e,"RESUME",null);finish(e);assertEquals(1,count(e));
    }
    @Test void failedAttemptRetriesBeforeManualJourneyFinishes() {
        var e=engine(1,List.of("g"),10);command(e,"FAIL","c1");command(e,"PRODUCE","p1");finish(e);
        assertEquals(List.of("FAILED","RETRY","PROCESSED"),events(e).stream().map(SimulationEngine.Event::stage).filter(s->Set.of("FAILED","RETRY","PROCESSED").contains(s)).toList());
    }
    @Test void liveTemplateEditsPreserveIdsAndRequestedOverrides() {
        var e=engine(1,List.of("g"),10);command(e,"PRODUCE","p1");var c=e.configuration();
        e.apply(new Configuration(1,c.brokers(),c.topics(),List.of(new Configuration.Producer("p1","Renamed","t1",1,false,"new-key","new-body")),c.groups(),c.consumers(),600,500,false),false,null);
        assertEquals("M1",queue(e,0).get(0).id());assertEquals("template-1",queue(e,0).get(0).payload());assertEquals("new-body",queue(e,0).get(1).payload());
    }
    @Test void scenarioSummarySurvivesRestartAndInternalMembershipChange() {
        var e=new SimulationEngine();e.scenario(10);for(int i=0;i<150;i++)e.advance();assertEquals(10,e.snapshot(0).get("scenarioId"));
        command(e,"RESET",null);assertEquals(10,e.snapshot(0).get("scenarioId"));assertEquals(0,e.snapshot(0).get("scenarioPhase"));
        e.apply(e.configuration(),false,null);assertEquals(0,e.snapshot(0).get("scenarioId"));
    }
    @Test void staleTickUnfinishedBatchAndAnotherDriverCannotAdvance() {
        var e=engine(1,List.of("g"),10);var now=new AtomicLong(1000);var clock=new PlaybackClock(e,now::get);
        clock.request(new PlaybackClock.Request("CLAIM","a",0,0,0));
        assertEquals("a",clock.request(new PlaybackClock.Request("CLAIM","b",0,0,0)).get("playbackOwner"));
        assertThrows(SimulationException.class,()->clock.request(new PlaybackClock.Request("ADVANCE","b",0,0,0)));
        command(e,"PRODUCE","p1");var s=e.snapshot(0);long epoch=(long)s.get("epoch"),latest=(long)s.get("latestEventId");
        assertThrows(SimulationException.class,()->clock.request(new PlaybackClock.Request("ADVANCE","a",epoch,0,latest-1)));
        clock.request(new PlaybackClock.Request("ADVANCE","a",epoch,0,latest));
        assertThrows(SimulationException.class,()->clock.request(new PlaybackClock.Request("ADVANCE","a",epoch,0,latest)));
        now.set(11001);clock.expire();assertEquals(true,e.snapshot(0).get("playbackPaused"));
        clock.request(new PlaybackClock.Request("CLAIM","b",epoch,1,latest));assertEquals("b",clock.snapshot(0).get("playbackOwner"));
    }
}
