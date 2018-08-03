---
date: 2018-07-31
linktitle: Unity custom hair simulation PT2
title: "Unity custom hair simulation PT2"
tags : ["unity","dynamics"]
draft : true
toc : true
tocname: "Table of contents:"
---

Here below the code implementation:

```c#
     public static void verletIntegration( float3[] positions, float3[] outPositions,
                                           float[] invMass, float3 gravity,
                                           float gravityMultiplier,
                                           float damping, float deltaTime)
    {
        int len = positions.Length;
        //for (int i = 0; i < len; ++i)
        for (int i = 0; i < len; ++i)
        {
            //extracting the velocity
            float3 v = positions[i] - outPositions[i];
            v *= damping;
            float3 accel = gravity*gravityMultiplier * invMass[i];
            //computing verlet integration
            outPositions[i] = positions[i] + v + accel*(deltaTime*deltaTime);
        }
    }
```

The above code starts by iterating all the particles one by one and extracting the
velocity. Apologies for the bit confusing naming convention of *positions*
and *outPositions*, I am still trying to figure out a good naming, the fact is
that I am only using two buffers to perform the computation, the *inPosition* buffer
holds the positions for frame $i$ meanwhile outPosition is the second buffer
that holds the positions of $i-1$.
I use the outPosition buffer to extract the velocity then
I override those values since won't be needed anymore.
After the function returns I perform the reference swap.