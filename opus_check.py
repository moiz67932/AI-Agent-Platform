import asyncio, os
from livekit import api

async def main():
    os.environ['LIVEKIT_URL'] = 'wss://sales-agent-fijyxxqg.livekit.cloud'
    os.environ['LIVEKIT_API_KEY'] = 'APILsK7BKUQ8uBh'
    os.environ['LIVEKIT_API_SECRET'] = 'YeapAbtU1SVU3C092FMXiSoPg4QCUjmSY9TVJfuI2cK'
    
    lkapi = api.LiveKitAPI()
    
    # Update the trunk with the EXACT password from the .env
    updated = await lkapi.sip.update_inbound_trunk_fields(
        "ST_yXcKejSRFuS5",
        auth_username="agt-f48d9e2a591b495d86",
        auth_password="uI_c1Bg1OS6gSJn8wqRxogUtpSY1XIaf",
        numbers=["+13103410536"],
    )
    print(f"Updated trunk: {updated.sip_trunk_id}")
    print(f"Username: {updated.auth_username}")
    print(f"Numbers: {list(updated.numbers)}")
    
    await lkapi.aclose()

asyncio.run(main())