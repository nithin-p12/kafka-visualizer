package com.kafka.visualizer.simulation;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;

@SuppressWarnings("unchecked")
class SimulationEngineTests {
    private SimulationEngine engine(int brokers, int partitions, int replication, int consumers) {
        var e = new SimulationEngine();
        var c = Configuration.preset(brokers, partitions, replication, Collections.nCopies(consumers, "results-group"), 1, 10);
        e.apply(manual(c, false, 600, 50), true, null); return e;
    }
    private Configuration manual(Configuration c, boolean autoCommit, int interval, int retention) {
        return new Configuration(1, c.brokers(), c.topics(), c.producers().stream().map(p -> new Configuration.Producer(p.id(), p.name(), p.topicId(), p.rate(), false, p.key(), p.payload())).toList(),
                c.groups(), c.consumers(), interval, retention, autoCommit);
    }
    private void command(SimulationEngine e, String type, String id) { e.command(new SimulationEngine.Command(type, id, null, null, null)); }
    private void produce(SimulationEngine e, String key) { e.command(new SimulationEngine.Command("PRODUCE", "p1", key, "test record", null)); }
    private List<Map<String,Object>> groups(SimulationEngine e) { return (List<Map<String,Object>>)e.snapshot(0).get("groups"); }
    private List<Map<String,Object>> members(SimulationEngine e) { return (List<Map<String,Object>>)groups(e).get(0).get("consumers"); }
    private List<Map<String,Object>> offsets(SimulationEngine e) { return (List<Map<String,Object>>)groups(e).get(0).get("offsets"); }
    private List<SimulationEngine.Event> events(SimulationEngine e) { return (List<SimulationEngine.Event>)e.snapshot(0).get("events"); }
    private void ticks(SimulationEngine e, int count) { for(int i=0;i<count;i++)e.advance(); }

    @Test void keyedAffinityAndIndependentOrderedOffsets() {
        var e=engine(3,3,2,3);
        for(int i=0;i<6;i++)produce(e,"customer-42");
        int selected=SimulationEngine.keyedPartition("customer-42",3);
        var history=e.history("t1",selected,null,0);
        var messages=(List<SimulationEngine.Message>)history.get("messages");
        assertEquals(List.of(0L,1L,2L,3L,4L,5L),messages.stream().map(SimulationEngine.Message::offset).toList());
        for(int i=0;i<3;i++)assertEquals(i==selected?6:0,e.history("t1",i,null,0).get("total"));
        assertEquals(0,SimulationEngine.keyedPartition("",3));
        assertEquals(SimulationEngine.keyedPartition("α-execution",10),SimulationEngine.keyedPartition("α-execution",10));
    }
    @Test void unkeyedRoundRobinDoesNotCreateGlobalPartitionOffsets() {
        var e=engine(3,3,2,3);for(int i=0;i<9;i++)produce(e,"");
        for(int i=0;i<3;i++)assertEquals(List.of(0L,1L,2L),((List<SimulationEngine.Message>)e.history("t1",i,null,0).get("messages")).stream().map(SimulationEngine.Message::offset).toList());
    }
    @Test void extraConsumersAreIdleAndOwnershipIsExclusive() {
        var e=engine(3,3,2,5);e.advance();
        assertEquals(2,members(e).stream().filter(c->c.get("status").equals("IDLE")).count());
        assertEquals(3,members(e).stream().mapToInt(c->((List<?>)c.get("assignments")).size()).sum());
        assertEquals(3,offsets(e).stream().map(o->o.get("ownerId")).distinct().count());
    }
    @Test void balancedAssignmentsForSixPartitionsAndThreeConsumers() {
        var e=engine(3,6,2,3);e.advance();assertTrue(members(e).stream().allMatch(c->((List<?>)c.get("assignments")).size()==2));
    }
    @Test void twoConsumersOwnThreePartitionsInTwoOneDistribution() {
        var e=engine(3,3,2,2);e.advance();
        assertEquals(List.of(1,2),members(e).stream().map(c->((List<?>)c.get("assignments")).size()).sorted().toList());
    }
    @Test void heterogeneousSubscriptionsNeverAssignIneligiblePartitions() {
        var e=engine(3,3,2,2);var c=e.configuration();
        var topics=List.of(c.topics().get(0),new Configuration.Topic("t2","pdf-processing",2,2));
        var consumers=List.of(new Configuration.Consumer("c1","ResultsService-1","results-group",List.of("t1"),10),new Configuration.Consumer("c2","PdfService-1","results-group",List.of("t2"),10));
        e.apply(new Configuration(1,c.brokers(),topics,c.producers(),c.groups(),consumers,600,50,false),false,null);e.advance();
        assertTrue(((List<String>)members(e).get(0).get("assignments")).stream().allMatch(k->k.startsWith("t1:")));
        assertTrue(((List<String>)members(e).get(1).get("assignments")).stream().allMatch(k->k.startsWith("t2:")));
        assertEquals(5,offsets(e).size());
    }
    @Test void groupsConsumeAllRecordsAndCommitIndependently() {
        var e=new SimulationEngine();var c=Configuration.preset(2,1,2,List.of("results-group","reports-group"),1,10);
        e.apply(manual(c,false,600,50),true,null);produce(e,"");e.advance();command(e,"COMMIT","c1");
        var first=(List<Map<String,Object>>)groups(e).get(0).get("offsets");var second=(List<Map<String,Object>>)groups(e).get(1).get("offsets");
        assertEquals(1L,first.get(0).get("committedNext"));assertNull(second.get(0).get("committedNext"));
        assertEquals(2,events(e).stream().filter(v->v.stage().equals("PROCESSED")).count());
        assertEquals(1,e.history("t1",0,null,0).get("total"));
    }
    @Test void crashAndMembershipChangesDoNotRebalanceUnrelatedGroups() {
        var e=new SimulationEngine();var c=Configuration.preset(2,1,2,List.of("results-group","reports-group"),1,1);
        e.apply(manual(c,false,600,50),true,null);produce(e,"");e.advance();
        long generation=(long)groups(e).get(1).get("generation");
        command(e,"CONSUMER_STOP","c1");
        var reports=(List<Map<String,Object>>)groups(e).get(1).get("consumers");
        assertEquals(generation,groups(e).get(1).get("generation"));assertEquals("PROCESSING",reports.get(0).get("status"));
        var members=new ArrayList<>(e.configuration().consumers());members.add(new Configuration.Consumer("c3","ResultsService-3","results-group",List.of("t1"),1));
        var active=e.configuration();e.apply(new Configuration(1,active.brokers(),active.topics(),active.producers(),active.groups(),members,600,50,false),false,null);
        assertEquals(generation,groups(e).get(1).get("generation"));ticks(e,9);
        reports=(List<Map<String,Object>>)groups(e).get(1).get("consumers");assertEquals(1L,reports.get(0).get("successes"));assertEquals(0L,reports.get(0).get("redeliveries"));
    }
    @Test void fetchedPositionIsNotCompletedOrCommittedPosition() {
        var e=engine(1,1,1,1);var c=e.configuration();
        e.apply(new Configuration(1,c.brokers(),c.topics(),c.producers(),c.groups(),List.of(new Configuration.Consumer("c1","SlowService","results-group",List.of("t1"),.25)),600,50,false),false,null);
        produce(e,"");e.advance();var o=offsets(e).get(0);
        assertEquals(1L,o.get("fetchedNext"));assertEquals(0L,o.get("completedNext"));assertNull(o.get("committedNext"));
        command(e,"COMMIT","c1");assertNull(offsets(e).get(0).get("committedNext"));
        ticks(e,39);command(e,"COMMIT","c1");assertEquals(1L,offsets(e).get(0).get("committedNext"));
    }
    @Test void failedProcessingRetriesSameOffsetWithoutPrematureCommit() {
        var e=engine(1,1,1,1);produce(e,"");command(e,"FAIL","c1");e.advance();
        assertEquals("FAILED",members(e).get(0).get("status"));command(e,"COMMIT","c1");assertNull(offsets(e).get(0).get("committedNext"));
        e.advance();assertEquals(1L,members(e).get(0).get("successes"));assertEquals(1L,members(e).get(0).get("retries"));
        var failed=events(e).stream().filter(v->v.stage().equals("FAILED")).findFirst().orElseThrow();
        var retry=events(e).stream().filter(v->v.stage().equals("RETRY")).findFirst().orElseThrow();assertEquals(failed.messageId(),retry.messageId());
    }
    @Test void crashBeforeCommitRedeliversButCommitPreventsFurtherReplay() {
        var e=engine(1,1,1,1);produce(e,"");e.advance();command(e,"CONSUMER_STOP","c1");e.advance();command(e,"CONSUMER_RESTART","c1");e.advance();
        assertEquals(2L,members(e).get(0).get("successes"));assertEquals(1L,members(e).get(0).get("redeliveries"));
        command(e,"COMMIT","c1");command(e,"CONSUMER_STOP","c1");e.advance();command(e,"CONSUMER_RESTART","c1");e.advance();
        assertEquals(2L,members(e).get(0).get("successes"));assertEquals(0L,offsets(e).get(0).get("lag"));
    }
    @Test void consumerPausePreservesAssignmentAndProcessingProgress() {
        var e=engine(1,1,1,1);e.advance();command(e,"CONSUMER_PAUSE","c1");produce(e,"");ticks(e,5);
        assertEquals(1,((List<?>)members(e).get(0).get("assignments")).size());assertEquals(0L,members(e).get(0).get("successes"));
        command(e,"CONSUMER_RESUME","c1");e.advance();assertEquals(1L,members(e).get(0).get("successes"));
    }
    @Test void leaderFailoverKeepsSeparateReplicaLogsAndAcknowledgedRecords() {
        var e=engine(3,1,2,1);produce(e,"");command(e,"BROKER_STOP","b1");
        produce(e,"");assertEquals(2,e.history("t1",0,null,0).get("total"));
        assertEquals(1,e.history("t1",0,"b1",0).get("total"));
        command(e,"BROKER_RESTART","b1");e.advance();assertEquals(2,e.history("t1",0,"b1",0).get("total"));
        assertTrue(events(e).stream().anyMatch(v->v.stage().equals("ELECTION")&&v.destinationName().contains("Broker-2")));
    }
    @Test void staleReplicaCannotBecomeLeaderAndUnavailableProductionAllocatesNoOffset() {
        var e=engine(2,1,2,1);command(e,"BROKER_STOP","b2");produce(e,"");command(e,"BROKER_STOP","b1");command(e,"BROKER_RESTART","b2");produce(e,"");
        assertEquals(1L,e.snapshot(0).get("messageCount"));assertFalse((boolean)offsets(e).get(0).get("available"));
        command(e,"BROKER_RESTART","b1");e.advance();assertTrue((boolean)offsets(e).get(0).get("available"));assertEquals(1,e.history("t1",0,"b2",0).get("total"));
    }
    @Test void allReplicasOfflineRemainUnavailableUntilCurrentReplicaReturns() {
        var e=engine(2,1,2,1);produce(e,"");command(e,"BROKER_STOP","b1");command(e,"BROKER_STOP","b2");
        assertFalse((boolean)offsets(e).get(0).get("available"));command(e,"BROKER_RESTART","b2");assertTrue((boolean)offsets(e).get(0).get("available"));
        assertEquals(1,e.history("t1",0,"b2",0).get("total"));
    }
    @Test void retentionPreservesOffsetNumbersAndReportsExpiredBacklog() {
        var e=engine(1,1,1,1);e.apply(manual(e.configuration(),false,600,2),false,null);
        for(int i=0;i<5;i++)produce(e,"");e.advance();
        assertEquals(List.of(3L,4L),((List<SimulationEngine.Message>)e.history("t1",0,null,0).get("messages")).stream().map(SimulationEngine.Message::offset).toList());
        assertEquals(3L,offsets(e).get(0).get("logStart"));assertEquals(3L,offsets(e).get(0).get("expiredBacklog"));
        assertEquals(4L,offsets(e).get(0).get("completedNext"));
    }
    @Test void membershipAndPartitionIncreasesRebalanceWithoutLosingRecordsOrOffsets() {
        var e=engine(3,3,2,2);produce(e,"");e.advance();command(e,"COMMIT",null);var c=e.configuration();
        var members=new ArrayList<>(c.consumers());members.add(new Configuration.Consumer("c3","ResultsService-3","results-group",List.of("t1"),10));
        e.apply(new Configuration(1,c.brokers(),List.of(new Configuration.Topic("t1","Renamed-topic",6,2)),c.producers(),c.groups(),members,600,50,false),false,null);
        assertTrue((boolean)groups(e).get(0).get("rebalancing"));e.advance();
        assertTrue(members(e).stream().allMatch(v->((List<?>)v.get("assignments")).size()==2));assertEquals(1L,offsets(e).get(0).get("committedNext"));
        assertEquals(1,e.history("t1",0,null,0).get("total"));
    }
    @Test void groupIdChangeStartsIndependentOffsetsRatherThanTransferringThem() {
        var e=engine(1,1,1,1);produce(e,"");e.advance();command(e,"COMMIT",null);var c=e.configuration();
        e.apply(new Configuration(1,c.brokers(),c.topics(),c.producers(),List.of("reports-group"),List.of(new Configuration.Consumer("c1","ReportsService","reports-group",List.of("t1"),10)),600,50,false),false,null);
        e.advance();assertNull(offsets(e).get(0).get("committedNext"));assertEquals(2L,members(e).get(0).get("successes"));
    }
    @Test void invalidOrResetRequiredConfigurationLeavesStateUntouched() {
        var e=engine(1,1,1,1);produce(e,"");var old=e.configuration();
        var bad=new Configuration(1,old.brokers(),List.of(new Configuration.Topic("t1","topic",1,2)),old.producers(),old.groups(),old.consumers(),600,50,false);
        assertThrows(SimulationException.class,()->e.apply(bad,false,null));assertEquals(old,e.configuration());assertEquals(1L,e.snapshot(0).get("messageCount"));
        var changed=new Configuration(1,List.of(new Configuration.Broker("b2","New broker")),old.topics(),old.producers(),old.groups(),old.consumers(),600,50,false);
        assertThrows(SimulationException.class,()->e.apply(changed,false,null));assertEquals(old,e.configuration());
        long version=(long)e.snapshot(0).get("configRevision");assertThrows(SimulationException.class,()->e.apply(old,false,version-1));
    }
    @Test void fractionalAndMaximumRatesAndLiveRateChangesUseLogicalTime() {
        var e=new SimulationEngine();var c=Configuration.preset(1,1,1,List.of("results-group"),.25,.25);e.apply(c,true,null);
        ticks(e,39);assertEquals(0L,e.snapshot(0).get("messageCount"));e.advance();assertEquals(1L,e.snapshot(0).get("messageCount"));
        var fast=new Configuration(1,c.brokers(),c.topics(),List.of(new Configuration.Producer("p1","ExecutionService","t1",10,true,"","event")),c.groups(),List.of(new Configuration.Consumer("c1","ResultsService-1","results-group",List.of("t1"),10)),40,50,true);
        e.apply(fast,false,null);ticks(e,10);assertEquals(11L,e.snapshot(0).get("messageCount"));assertTrue((long)members(e).get(0).get("successes")>=10);
    }
    @Test void automaticCommitAndManualModeHonorDifferentCommitTriggers() {
        var e=engine(1,1,1,1);e.apply(manual(e.configuration(),true,3,50),false,null);produce(e,"");e.advance();
        assertNull(offsets(e).get(0).get("committedNext"));ticks(e,2);assertEquals(1L,offsets(e).get(0).get("committedNext"));
        assertTrue(events(e).stream().filter(v->v.stage().equals("COMMITTED")).allMatch(v->v.committedNext()==1&&v.destination().equals("offset-store")));
    }
    @Test void offsetCommitsFailExplicitlyWhileEveryBrokerIsOffline() {
        var e=engine(1,1,1,1);produce(e,"");e.advance();command(e,"BROKER_STOP","b1");command(e,"COMMIT","c1");
        assertNull(offsets(e).get(0).get("committedNext"));assertTrue(events(e).stream().anyMatch(v->v.stage().equals("COMMIT_FAILED")));
        command(e,"BROKER_RESTART","b1");command(e,"COMMIT","c1");assertEquals(1L,offsets(e).get(0).get("committedNext"));
    }
    @Test void replayIsDeterministicAndPauseStepResetAreConsistent() {
        var first=new SimulationEngine();var second=new SimulationEngine();ticks(first,60);ticks(second,60);assertEquals(first.snapshot(0),second.snapshot(0));
        command(first,"PAUSE",null);first.advanceIfRunning();assertEquals(60L,first.snapshot(0).get("tick"));command(first,"STEP",null);assertEquals(61L,first.snapshot(0).get("tick"));
        command(first,"START",null);assertThrows(SimulationException.class,()->command(first,"STEP",null));
        var c=first.configuration();command(first,"RESET",null);assertEquals(c,first.configuration());assertEquals(0L,first.snapshot(0).get("messageCount"));assertEquals(false,first.snapshot(0).get("running"));
    }
    @Test void eventStagesPreserveActualFlowOrderAndHistoryIsBounded() {
        var e=engine(2,1,2,1);produce(e,"");e.advance();command(e,"COMMIT",null);
        assertEquals(List.of("PRODUCED","REPLICATED","ACKNOWLEDGED","DELIVERED","PROCESSING","PROCESSED","COMMITTED"),events(e).stream().map(SimulationEngine.Event::stage).filter(s->Set.of("PRODUCED","REPLICATED","ACKNOWLEDGED","DELIVERED","PROCESSING","PROCESSED","COMMITTED").contains(s)).toList());
        for(int i=0;i<1000;i++)produce(e,"");assertEquals(2000,events(e).size());assertEquals(true,e.snapshot(1).get("eventGap"));
    }
    @ParameterizedTest @ValueSource(ints={1,2,3,4,5,6,7,8,9,10}) void guidedScenariosReachTheirMilestones(int id) {
        var e=new SimulationEngine();e.scenario(id);ticks(e,150);
        assertTrue((long)e.snapshot(0).get("messageCount")>0);
        if(id==3)assertEquals(2,members(e).stream().filter(c->c.get("status").equals("IDLE")).count());
        if(id==5)assertEquals(3,groups(e).size());
        if(id==6){assertTrue((long)members(e).get(0).get("redeliveries")>0);assertEquals(3,e.snapshot(0).get("scenarioPhase"));}
        if(id==7)assertTrue(events(e).stream().anyMatch(v->v.stage().equals("ELECTION")));
        if(id==8)assertTrue((long)groups(e).get(0).get("lag")>50);
        if(id==9)assertEquals(1,offsets(e).stream().filter(o->(long)o.get("logEnd")>0).count());
        if(id==10)assertEquals(3,members(e).size());
    }
}
