package com.kafka.visualizer.simulation;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;

@SuppressWarnings("unchecked")
class GuidanceTests {
    private SimulationEngine.GuideCue cue(SimulationEngine e) { return (SimulationEngine.GuideCue)e.snapshot(0).get("guideCue"); }
    private void next(SimulationEngine e) { e.command(new SimulationEngine.Command("GUIDE_CONTINUE",cue(e).token(),null,null,null)); }
    private void until(SimulationEngine e,String key) {
        for(int i=0;i<250 && (cue(e)==null || !cue(e).key().equals(key));i++) {
            if(cue(e)!=null)next(e); else e.advanceIfRunning();
        }
        assertNotNull(cue(e));assertEquals(key,cue(e).key());
    }
    @Test void failoverReallyWaitsForContinueAndRejectsStaleCheckpoint() {
        var e=new SimulationEngine();e.scenario(7,true);until(e,"before-failover");
        assertTrue(((List<Map<String,Object>>)e.snapshot(0).get("brokers")).stream().allMatch(b->(boolean)b.get("online")));
        var before=e.snapshot(0);e.advanceIfRunning();e.advance();assertEquals(before.get("tick"),e.snapshot(0).get("tick"));
        assertThrows(SimulationException.class,()->e.command(new SimulationEngine.Command("STEP",null,null,null,null)));
        assertThrows(SimulationException.class,()->e.command(new SimulationEngine.Command("GUIDE_CONTINUE","stale",null,null,null)));
        next(e);e.advanceIfRunning();assertEquals("failover-done",cue(e).key());
        assertTrue(((List<Map<String,Object>>)e.snapshot(0).get("brokers")).stream().anyMatch(b->!(boolean)b.get("online")));
        assertTrue(cue(e).targets().stream().anyMatch(x->x.equals("broker:b2")));
    }
    @Test void joiningConsumerDoesNotExistBeforeItsCheckpoint() {
        var e=new SimulationEngine();e.scenario(10,true);until(e,"before-join");assertEquals(2,e.configuration().consumers().size());
        next(e);e.advanceIfRunning();assertEquals(3,e.configuration().consumers().size());assertEquals("join-done",cue(e).key());
        var g=((List<Map<String,Object>>)e.snapshot(0).get("groups")).get(0);
        for(var c:(List<Map<String,Object>>)g.get("consumers")) assertEquals(1,((List<?>)c.get("assignments")).size());
    }
    @ParameterizedTest @ValueSource(ints={1,2,3,4,5,6,7,8,9,10})
    void allScenariosHaveMeaningfulOneShotCheckpointsAndCanContinue(int id) {
        var e=new SimulationEngine();e.scenario(id,true);var keys=new HashSet<String>();
        for(int i=0;i<200;i++) {
            var c=cue(e);
            if(c!=null) { assertTrue(keys.add(c.key()),"Repeated checkpoint "+c.key());assertFalse(c.targets().isEmpty());next(e); }
            else e.advanceIfRunning();
        }
        assertFalse(keys.isEmpty(),"No guide for scenario "+id);
        if(id==6) { assertTrue(keys.containsAll(Set.of("before-crash","before-restart","redelivery-done")));assertEquals(false,e.snapshot(0).get("running")); }
    }
    @Test void disablingGuidanceReleasesCheckpointWithoutResettingMessages() {
        var e=new SimulationEngine();e.scenario(7,true);until(e,"before-failover");var count=e.snapshot(0).get("messageCount");
        e.command(new SimulationEngine.Command("GUIDE_DISABLE",null,null,null,null));assertNull(cue(e));assertTrue(e.shouldAdvance());
        assertEquals(count,e.snapshot(0).get("messageCount"));e.advanceIfRunning();assertEquals(1,e.snapshot(0).get("scenarioPhase"));
    }
    @Test void customRunUsesConfigurationRevisionAndAssignmentsDoNotPublishRecords() {
        var e=new SimulationEngine();long revision=(long)e.snapshot(0).get("configRevision");
        assertThrows(SimulationException.class,()->e.runCustom(Configuration.defaults(),revision-1,true));
        e.runCustom(Configuration.preset(3,3,2,List.of("results-group","results-group","results-group"),10,10),revision,true);e.advanceIfRunning();
        assertEquals("initial-assignment",cue(e).key());assertEquals(0L,e.snapshot(0).get("messageCount"));
        var events=(List<SimulationEngine.Event>)e.snapshot(0).get("events");
        assertEquals(3,events.stream().filter(x->x.stage().equals("ASSIGNMENT")).count());
        assertTrue(events.stream().filter(x->x.stage().equals("ASSIGNMENT")).allMatch(x->x.message()==null && x.offset()==null));
    }
    @Test void lagGuidanceStillCountsPartitionsWithoutAnOnlineOwner() {
        var e=new SimulationEngine();
        e.runCustom(Configuration.preset(1,1,1,List.of("g"),10,1),null,true);
        e.command(new SimulationEngine.Command("CONSUMER_STOP","c1",null,null,null));
        until(e,"lag-threshold");assertTrue(cue(e).description().contains("20 records"));
    }
    @Test void oldContinueCannotReleaseTheSameMilestoneInAnotherRun() {
        var e=new SimulationEngine();e.scenario(7,true);until(e,"before-failover");String old=cue(e).token();
        e.scenario(7,true);until(e,"before-failover");assertNotEquals(old,cue(e).token());
        assertThrows(SimulationException.class,()->e.command(new SimulationEngine.Command("GUIDE_CONTINUE",old,null,null,null)));
        assertNotNull(cue(e));
    }
}
