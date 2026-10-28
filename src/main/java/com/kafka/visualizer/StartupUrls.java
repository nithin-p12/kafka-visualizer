package com.kafka.visualizer;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

/** Logs copy-pasteable UI links once the embedded server is ready, using the actual bound address and port. */
@Component
public class StartupUrls {
    private static final Logger log = LoggerFactory.getLogger(StartupUrls.class);
    private final Environment env;
    public StartupUrls(Environment env) { this.env = env; }

    @EventListener(ApplicationReadyEvent.class)
    public void logUrls() {
        String port = env.getProperty("local.server.port");
        if (port == null) return; // no real web server (e.g. mock-environment tests)
        String address = env.getProperty("server.address", "localhost");
        if (address.isBlank() || address.equals("0.0.0.0") || address.equals("::")) address = "localhost";
        String base = "http://" + (address.contains(":") ? "[" + address + "]" : address) + ":" + port;
        log.info("""

                ----------------------------------------------------------
                  Kafka Visualizer is running. Open in your browser:
                    Home:        {}/
                    Learn:       {}/learn.html
                    Visualizer:  {}/visualizer.html
                ----------------------------------------------------------""", base, base, base);
    }
}
