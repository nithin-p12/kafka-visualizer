package com.kafka.visualizer.simulation;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import tools.jackson.databind.json.JsonMapper;
import java.net.URI;
import java.net.http.*;
import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class SimulationHttpTests {
    @LocalServerPort int port;
    @Autowired JsonMapper mapper;
    private final HttpClient client=HttpClient.newHttpClient();
    private HttpResponse<String> request(String method,String path,String body) throws Exception {
        var builder=HttpRequest.newBuilder(URI.create("http://localhost:"+port+path)).header("Content-Type","application/json");
        builder.method(method,body==null?HttpRequest.BodyPublishers.noBody():HttpRequest.BodyPublishers.ofString(body));
        return client.send(builder.build(),HttpResponse.BodyHandlers.ofString());
    }
    @Test void servesDashboardAndSimulationCommands() throws Exception {
        var home=request("GET","/",null);assertEquals(200,home.statusCode());assertTrue(home.body().contains("Kafka Visualizer"));
        assertEquals(200,request("GET","/app.js",null).statusCode());
        assertEquals(200,request("POST","/api/simulation/commands","{\"type\":\"RESET\"}").statusCode());
        var result=request("POST","/api/simulation/commands","{\"type\":\"PRODUCE\",\"targetId\":\"p1\",\"key\":\"execution-42\",\"payload\":\"PDF complete\"}");
        assertEquals(200,result.statusCode());assertEquals(0,mapper.readTree(result.body()).get("messageCount").asInt());
        var queued=mapper.readTree(result.body());
        var tick=request("POST","/api/simulation/playback","{\"action\":\"ADVANCE\",\"clientId\":\"http-test\",\"epoch\":"+queued.get("epoch").asLong()+",\"expectedTick\":0,\"completedEventId\":"+queued.get("latestEventId").asLong()+"}");
        assertEquals(200,tick.statusCode());assertEquals(1,mapper.readTree(tick.body()).get("messageCount").asInt());
        assertEquals(400,request("POST","/api/simulation/commands","{\"type\":\"INVALID\"}").statusCode());
        assertEquals(10,mapper.readTree(request("GET","/api/simulation/scenarios",null).body()).size());
    }
    @Test void jsonConfigurationRoundTripsWithNamesAndSubscriptions() throws Exception {
        var config=Configuration.defaults();String json=mapper.writeValueAsString(config);
        assertEquals(config,mapper.readValue(json,Configuration.class));
        var result=request("PUT","/api/simulation/configuration","{\"configuration\":"+json+",\"reset\":true}");
        assertEquals(200,result.statusCode());
        assertEquals(config,mapper.readValue(request("GET","/api/simulation/configuration",null).body(),Configuration.class));
        assertEquals(400,request("PUT","/api/simulation/configuration","{\"configuration\":null}").statusCode());
    }
}
